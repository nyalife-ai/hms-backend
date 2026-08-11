/**
 * Journal entry engine — create, balance-check, post, reverse.
 */

import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma';
import { assertPostableActiveAccount } from '../domain/account-rules';
import { moneyFrom, moneyToDecimal, moneyZero } from '../domain/money';
import { nextDocumentNumber, withNumberRetry } from './numbering';
import { resolveOpenPeriod } from './period-resolver';

export type JournalLineInput = {
  accountId: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: string | number;
  description?: string;
};

type Tx = Prisma.TransactionClient;

export function assertJournalBalanced(lines: JournalLineInput[]): void {
  if (lines.length < 2) {
    throw new BadRequestException(
      'A journal entry needs at least two lines',
    );
  }
  let debit = moneyZero();
  let credit = moneyZero();
  for (const line of lines) {
    const amt = moneyFrom(line.amount);
    if (!amt.isPositive()) {
      throw new BadRequestException('Journal line amounts must be greater than zero');
    }
    const dir = line.direction.toUpperCase();
    if (dir === 'DEBIT') debit = debit.add(amt);
    else if (dir === 'CREDIT') credit = credit.add(amt);
    else {
      throw new BadRequestException('Journal line direction must be DEBIT or CREDIT');
    }
  }
  if (!debit.equals(credit)) {
    throw new BadRequestException(
      `Journal entry is unbalanced: debits ${moneyToDecimal(debit)} ≠ credits ${moneyToDecimal(credit)}`,
    );
  }
}

async function loadPostableAccounts(tx: Tx, accountIds: string[]) {
  const unique = [...new Set(accountIds)];
  const rows = await tx.accounts.findMany({ where: { id: { in: unique } } });
  if (rows.length !== unique.length) {
    throw new BadRequestException('One or more accounts were not found');
  }
  for (const a of rows) assertPostableActiveAccount(a);
  return rows;
}

export async function createAndPostJournal(
  tx: Tx,
  input: {
    entryDate: Date;
    referenceType: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE' | 'ADJUSTMENT' | 'MANUAL';
    referenceId?: string | null;
    description?: string;
    lines: JournalLineInput[];
    createdBy: string;
    status?: 'DRAFT' | 'POSTED';
  },
): Promise<{ id: string; entryNumber: string }> {
  assertJournalBalanced(input.lines);
  await loadPostableAccounts(
    tx,
    input.lines.map((l) => l.accountId),
  );
  const period = await resolveOpenPeriod(tx, input.entryDate);
  const postNow = (input.status ?? 'POSTED') === 'POSTED';

  return withNumberRetry(async (attempt) => {
    const entryNumber = await nextDocumentNumber(tx, 'JE', attempt);
    const entry = await tx.journalEntries.create({
      data: {
        entry_number: entryNumber,
        posting_period_id: period.id,
        entry_date: input.entryDate,
        status: postNow ? 'POSTED' : 'DRAFT',
        reference_type: input.referenceType,
        reference_id: input.referenceId ?? null,
        description: input.description ?? null,
        created_by: input.createdBy,
        posted_by: postNow ? input.createdBy : null,
        posted_at: postNow ? new Date() : null,
        billing_journal_lines_journal_entry_id: {
          create: input.lines.map((l) => ({
            account_id: l.accountId,
            direction: l.direction.toUpperCase(),
            amount: moneyToDecimal(moneyFrom(l.amount)),
            description: l.description ?? null,
          })),
        },
      },
    });
    return { id: entry.id, entryNumber: entry.entry_number };
  });
}

export async function postDraftJournal(
  tx: Tx,
  journalEntryId: string,
  postedBy: string,
): Promise<{ id: string; entryNumber: string }> {
  const entry = await tx.journalEntries.findFirst({
    where: { id: journalEntryId },
    include: { billing_journal_lines_journal_entry_id: true },
  });
  if (!entry) throw new NotFoundException('Journal entry not found');
  if (entry.status !== 'DRAFT') {
    throw new BadRequestException('Only draft journal entries can be posted');
  }
  const lines = entry.billing_journal_lines_journal_entry_id.map((l) => ({
    accountId: l.account_id,
    direction: l.direction as 'DEBIT' | 'CREDIT',
    amount: l.amount.toString(),
  }));
  assertJournalBalanced(lines);
  await loadPostableAccounts(tx, lines.map((l) => l.accountId));
  await resolveOpenPeriod(tx, entry.entry_date);

  const updated = await tx.journalEntries.update({
    where: { id: entry.id },
    data: {
      status: 'POSTED',
      posted_by: postedBy,
      posted_at: new Date(),
    },
  });
  return { id: updated.id, entryNumber: updated.entry_number };
}

export async function reverseJournal(
  tx: Tx,
  journalEntryId: string,
  actorUserId: string,
  reason?: string,
): Promise<{ id: string; entryNumber: string }> {
  const entry = await tx.journalEntries.findFirst({
    where: { id: journalEntryId },
    include: { billing_journal_lines_journal_entry_id: true },
  });
  if (!entry) throw new NotFoundException('Journal entry not found');
  if (entry.status !== 'POSTED') {
    throw new BadRequestException('Only posted journal entries can be reversed');
  }
  const flip = entry.billing_journal_lines_journal_entry_id.map((l) => ({
    accountId: l.account_id,
    direction: (l.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT') as
      | 'DEBIT'
      | 'CREDIT',
    amount: l.amount.toString(),
    description: `Reversal of ${entry.entry_number}`,
  }));
  const reversal = await createAndPostJournal(tx, {
    entryDate: new Date(),
    referenceType: (entry.reference_type as
      | 'INVOICE'
      | 'PAYMENT'
      | 'CREDIT_NOTE'
      | 'ADJUSTMENT'
      | 'MANUAL'
      | null) || 'ADJUSTMENT',
    referenceId: entry.reference_id,
    description: reason || `Reversal of ${entry.entry_number}`,
    lines: flip,
    createdBy: actorUserId,
    status: 'POSTED',
  });
  await tx.journalEntries.update({
    where: { id: entry.id },
    data: { status: 'REVERSED' },
  });
  await tx.journalEntries.update({
    where: { id: reversal.id },
    data: { reversal_of_id: entry.id },
  });
  return reversal;
}

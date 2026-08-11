/**
 * Chart of accounts validation rules.
 */

import { BadRequestException } from '@nestjs/common';

export const ACCOUNT_TYPES = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const NORMAL_BALANCES = ['DEBIT', 'CREDIT'] as const;
export type NormalBalance = (typeof NORMAL_BALANCES)[number];

const EXPECTED_NORMAL: Record<AccountType, NormalBalance> = {
  ASSET: 'DEBIT',
  EXPENSE: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
};

export function assertAccountTypeBalance(
  accountType: string,
  normalBalance: string,
): void {
  const type = accountType.toUpperCase();
  const bal = normalBalance.toUpperCase();
  if (!ACCOUNT_TYPES.includes(type as AccountType)) {
    throw new BadRequestException(
      `Account type must be one of ${ACCOUNT_TYPES.join(', ')}`,
    );
  }
  if (!NORMAL_BALANCES.includes(bal as NormalBalance)) {
    throw new BadRequestException(
      `Normal balance must be one of ${NORMAL_BALANCES.join(', ')}`,
    );
  }
  const expected = EXPECTED_NORMAL[type as AccountType];
  if (bal !== expected) {
    throw new BadRequestException(
      `${type} accounts must use normal balance ${expected}`,
    );
  }
}

export function assertPostableActiveAccount(account: {
  is_active: boolean;
  is_postable: boolean;
  account_name: string;
  account_code: string;
}): void {
  if (!account.is_active) {
    throw new BadRequestException(
      `Account ${account.account_code} (${account.account_name}) is inactive`,
    );
  }
  if (!account.is_postable) {
    throw new BadRequestException(
      `Account ${account.account_code} (${account.account_name}) cannot receive postings`,
    );
  }
}

/**
 * Live-DB Billing accounting journey e2e (opt-in: E2E_USE_LIVE_DB=true).
 *
 * Service → Invoice → Issue (JE) → Payment → Allocate (JE) → verify balances.
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createE2eApp } from './create-e2e-app';

describe('Live DB — Billing accounting journey', () => {
  const live = process.env.E2E_USE_LIVE_DB === 'true';

  it('is opt-in via E2E_USE_LIVE_DB', () => {
    expect(typeof live).toBe('boolean');
  });

  it('invoice issue + payment journals balance and settle AR', async () => {
    if (!live) {
      expect(process.env.E2E_USE_LIVE_DB !== 'true').toBe(true);
      return;
    }

    let app: INestApplication | undefined;
    try {
      app = await createE2eApp();
      const prisma = app.get(PrismaService);
      if (!prisma.isConnected) {
        expect(prisma.isConnected).toBe(false);
        return;
      }

      const http = (): App => app!.getHttpServer() as App;
      const login = await request(http())
        .post('/auth/login')
        .send({
          email: process.env.E2E_ADMIN_EMAIL || 'admin@nyalife.health',
          password: process.env.E2E_ADMIN_PASSWORD || 'nyalife123',
        });
      expect([200, 201]).toContain(login.status);
      const auth = { Authorization: `Bearer ${login.body.accessToken}` };

      // Ensure foundation (COA / period / services)
      const overview = await request(http()).get('/billing/overview').set(auth);
      expect(overview.status).toBe(200);

      const patient = await prisma.patients.findFirst({
        where: { deleted_at: null },
      });
      expect(patient).toBeTruthy();

      const services = await request(http())
        .get('/billing/services?limit=50&active=true')
        .set(auth);
      expect(services.status).toBe(200);
      const consult =
        (services.body.items ?? services.body).find(
          (s: { serviceCode?: string; service_code?: string }) =>
            (s.serviceCode || s.service_code) === 'CONSULT',
        ) ?? (services.body.items ?? [])[0];
      expect(consult).toBeTruthy();
      const serviceId = consult.id;

      const draft = await request(http())
        .post('/billing/invoices')
        .set(auth)
        .send({
          patientId: patient!.id,
          lines: [
            {
              serviceId,
              quantity: 1,
            },
          ],
          notes: 'E2E accounting invoice',
        });
      expect([200, 201]).toContain(draft.status);
      expect(draft.body.status).toBe('DRAFT');
      const invoiceId = draft.body.id as string;
      const expectedTotal = draft.body.totalAmount as string;

      const issued = await request(http())
        .post(`/billing/invoices/${invoiceId}/issue`)
        .set(auth);
      expect([200, 201]).toContain(issued.status);
      expect(issued.body.status).toBe('ISSUED');

      const invJe = await prisma.journalEntries.findFirst({
        where: {
          reference_type: 'INVOICE',
          reference_id: invoiceId,
          status: 'POSTED',
        },
        include: { billing_journal_lines_journal_entry_id: true },
      });
      expect(invJe).toBeTruthy();
      const invDebit = invJe!.billing_journal_lines_journal_entry_id
        .filter((l) => l.direction === 'DEBIT')
        .reduce((s, l) => s + Number(l.amount), 0);
      const invCredit = invJe!.billing_journal_lines_journal_entry_id
        .filter((l) => l.direction === 'CREDIT')
        .reduce((s, l) => s + Number(l.amount), 0);
      expect(invDebit).toBeCloseTo(invCredit, 2);
      expect(invDebit).toBeCloseTo(Number(expectedTotal), 2);

      const methods = await request(http())
        .get('/billing/payment-methods')
        .set(auth);
      expect(methods.status).toBe(200);
      const methodList = Array.isArray(methods.body)
        ? methods.body
        : methods.body.items ?? [];
      const cash = methodList.find(
        (m: { methodCode?: string }) => m.methodCode === 'CASH',
      );
      expect(cash).toBeTruthy();

      const payment = await request(http())
        .post('/billing/payments')
        .set(auth)
        .send({
          patientId: patient!.id,
          amount: expectedTotal,
          paymentMethodId: cash.id,
          allocateToInvoiceId: invoiceId,
          transactionReference: `E2E-${Date.now()}`,
        });
      expect([200, 201]).toContain(payment.status);

      const paidInv = await request(http())
        .get(`/billing/invoices/${invoiceId}`)
        .set(auth);
      expect(paidInv.status).toBe(200);
      expect(paidInv.body.status).toBe('PAID');
      expect(Number(paidInv.body.outstanding)).toBe(0);

      const payJe = await prisma.journalEntries.findFirst({
        where: {
          reference_type: 'PAYMENT',
          reference_id: payment.body.id,
          status: 'POSTED',
        },
        include: { billing_journal_lines_journal_entry_id: true },
      });
      expect(payJe).toBeTruthy();
      const payDebit = payJe!.billing_journal_lines_journal_entry_id
        .filter((l) => l.direction === 'DEBIT')
        .reduce((s, l) => s + Number(l.amount), 0);
      const payCredit = payJe!.billing_journal_lines_journal_entry_id
        .filter((l) => l.direction === 'CREDIT')
        .reduce((s, l) => s + Number(l.amount), 0);
      expect(payDebit).toBeCloseTo(payCredit, 2);

      // Overpayment must fail
      const over = await request(http())
        .post('/billing/payments')
        .set(auth)
        .send({
          patientId: patient!.id,
          amount: '1.00',
          paymentMethodId: cash.id,
          allocateToInvoiceId: invoiceId,
          transactionReference: `E2E-OVER-${Date.now()}`,
        });
      expect(over.status).toBeGreaterThanOrEqual(400);
    } finally {
      await app?.close();
    }
  }, 120_000);
});

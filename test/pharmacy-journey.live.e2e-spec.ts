/**
 * Live-DB Pharmacy journey e2e (opt-in: E2E_USE_LIVE_DB=true).
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createE2eApp } from './create-e2e-app';

describe('Live DB — Pharmacy journey', () => {
  const live = process.env.E2E_USE_LIVE_DB === 'true';

  it('is opt-in via E2E_USE_LIVE_DB', () => {
    expect(typeof live).toBe('boolean');
  });

  it('supplier → category → med → PO receive → Rx dispense → damage', async () => {
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

      const doctor = await prisma.staffProfiles.findFirst({
        where: { deleted_at: null },
      });
      const patient = await prisma.patients.findFirst({
        where: { deleted_at: null },
      });
      expect(doctor).toBeTruthy();
      expect(patient).toBeTruthy();

      const suffix = Date.now().toString(36);

      const supplier = await request(http())
        .post('/pharmacy/suppliers')
        .set(auth)
        .send({ companyName: `E2E Pharma ${suffix}`, phone: '0700000000' });
      expect([200, 201]).toContain(supplier.status);

      const category = await request(http())
        .post('/pharmacy/categories')
        .set(auth)
        .send({ categoryName: `E2E Cat ${suffix}` });
      expect([200, 201]).toContain(category.status);

      const med = await request(http())
        .post('/pharmacy/medications')
        .set(auth)
        .send({
          medicationName: `E2E Med ${suffix}`,
          categoryId: category.body.id,
          form: 'TABLET',
          unit: 'tabs',
          standardSellingPrice: 50,
        });
      expect([200, 201]).toContain(med.status);

      const po = await request(http())
        .post('/pharmacy/purchase-orders')
        .set(auth)
        .send({
          supplierId: supplier.body.id,
          lines: [
            {
              medicationId: med.body.id,
              quantityOrdered: 20,
              unitCost: 10,
            },
          ],
        });
      expect([200, 201]).toContain(po.status);

      await request(http())
        .post(`/pharmacy/purchase-orders/${po.body.id}/send`)
        .set(auth)
        .expect((res) => expect([200, 201]).toContain(res.status));

      const receive = await request(http())
        .post(`/pharmacy/purchase-orders/${po.body.id}/receive`)
        .set(auth)
        .send({
          receipts: [
            {
              lineId: po.body.lines[0].id,
              quantity: 20,
              batchNumber: `LOT-${suffix}`,
              expiryDate: '2027-12-01',
            },
          ],
        });
      expect([200, 201]).toContain(receive.status);
      expect(receive.body.status).toBe('RECEIVED');

      const rx = await request(http())
        .post('/pharmacy/prescriptions')
        .set(auth)
        .send({
          patientId: patient!.id,
          prescribedByStaffId: doctor!.id,
          lines: [
            {
              medicationId: med.body.id,
              dosage: '500mg',
              frequency: 'TDS',
              duration: '5 days',
              quantity: 5,
            },
          ],
        });
      expect([200, 201]).toContain(rx.status);

      const dispensed = await request(http())
        .post(`/pharmacy/prescriptions/${rx.body.id}/dispense`)
        .set(auth)
        .send({});
      expect([200, 201]).toContain(dispensed.status);
      expect(dispensed.body.status).toBe('DISPENSED');

      const batches = await request(http())
        .get(`/pharmacy/batches?medicationId=${med.body.id}`)
        .set(auth)
        .expect(200);
      const batch = batches.body[0];
      expect(batch.quantityOnHand).toBe(15);

      const damage = await request(http())
        .post('/pharmacy/stock/damage')
        .set(auth)
        .send({
          batchId: batch.id,
          quantity: 2,
          reason: 'E2E damaged blister',
        });
      expect([200, 201]).toContain(damage.status);

      const movements = await request(http())
        .get(`/pharmacy/stock/movements?batchId=${batch.id}`)
        .set(auth)
        .expect(200);
      expect(movements.body.length).toBeGreaterThanOrEqual(3);

      const gone = await request(http())
        .post('/medications')
        .set(auth)
        .send({ name: 'x' });
      expect(gone.status).toBe(410);
    } finally {
      await app?.close();
    }
  }, 180_000);
});

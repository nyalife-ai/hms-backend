/**
 * File: create-prescription.dto.spec.ts
 * Module: prescriptions
 * Purpose: DTO validation smoke tests.
 */

import { validate } from 'class-validator';
import { CreatePrescriptionDto } from '../create-prescription.dto';

describe('CreatePrescriptionDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreatePrescriptionDto(), {
      patientId: '550e8400-e29b-41d4-a716-446655440000',
      prescribedBy: '550e8400-e29b-41d4-a716-446655440001',
      name: 'RX-001',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

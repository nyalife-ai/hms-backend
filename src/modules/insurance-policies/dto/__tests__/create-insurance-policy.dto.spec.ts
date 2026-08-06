/**
 * File: create-insurance-policy.dto.spec.ts
 */

import { validate } from 'class-validator';
import { CreateInsurancePolicyDto } from '../create-insurance-policy.dto';

const UUID = '00000000-0000-4000-8000-000000000001';

describe('CreateInsurancePolicyDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateInsurancePolicyDto(), {
      name: 'POL-12345',
      patientId: UUID,
      providerId: UUID,
      startDate: '2026-01-01',
      expiryDate: '2027-01-01',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

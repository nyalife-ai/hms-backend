/**
 * File: create-pharmacy.dto.spec.ts
 * Module: pharmacy
 * Purpose: DTO validation smoke tests.
 */

import { validate } from 'class-validator';
import { CreatePharmacyDto } from '../create-pharmacy.dto';

describe('CreatePharmacyDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreatePharmacyDto(), { name: 'ok' });
    expect(await validate(dto)).toHaveLength(0);
  });
});

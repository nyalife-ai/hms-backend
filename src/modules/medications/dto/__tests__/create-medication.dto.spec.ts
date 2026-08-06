/**
 * File: create-medication.dto.spec.ts
 * Module: medications
 * Purpose: DTO validation smoke tests.
 */

import { validate } from 'class-validator';
import { CreateMedicationDto } from '../create-medication.dto';

describe('CreateMedicationDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateMedicationDto(), { name: 'ok' });
    expect(await validate(dto)).toHaveLength(0);
  });
});

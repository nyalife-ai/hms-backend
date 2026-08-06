/**
 * File: create-laboratory.dto.spec.ts
 * Module: laboratory
 * Purpose: DTO validation smoke tests.
 */

import { validate } from 'class-validator';
import { CreateLaboratoryDto } from '../create-laboratory.dto';

describe('CreateLaboratoryDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateLaboratoryDto(), { name: 'ok' });
    expect(await validate(dto)).toHaveLength(0);
  });
});

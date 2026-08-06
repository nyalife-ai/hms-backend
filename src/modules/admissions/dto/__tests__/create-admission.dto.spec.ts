/**
 * File: create-admission.dto.spec.ts
 * Module: admissions
 * Purpose: DTO validation smoke tests.
 */

import { validate } from 'class-validator';
import { CreateAdmissionDto } from '../create-admission.dto';

describe('CreateAdmissionDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateAdmissionDto(), { name: 'ok' });
    expect(await validate(dto)).toHaveLength(0);
  });
});

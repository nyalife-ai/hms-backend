/**
 * File: create-inpatient.dto.spec.ts
 * Module: inpatient
 * Purpose: DTO validation smoke tests.
 */

import { validate } from 'class-validator';
import { CreateInpatientDto } from '../create-inpatient.dto';

describe('CreateInpatientDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateInpatientDto(), { name: 'ok' });
    expect(await validate(dto)).toHaveLength(0);
  });
});

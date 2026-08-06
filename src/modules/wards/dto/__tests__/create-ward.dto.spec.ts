/**
 * File: create-ward.dto.spec.ts
 * Module: wards
 * Purpose: DTO validation smoke tests.
 */

import { validate } from 'class-validator';
import { CreateWardDto } from '../create-ward.dto';

describe('CreateWardDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateWardDto(), { name: 'ok' });
    expect(await validate(dto)).toHaveLength(0);
  });
});

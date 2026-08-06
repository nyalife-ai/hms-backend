/**
 * File: create-department.dto.spec.ts
 * Module: departments
 * Purpose: DTO validation smoke tests.
 */

import { validate } from 'class-validator';
import { CreateDepartmentDto } from '../create-department.dto';

describe('CreateDepartmentDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateDepartmentDto(), { name: 'ok' });
    expect(await validate(dto)).toHaveLength(0);
  });
});

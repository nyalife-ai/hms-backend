/**
 * File: create-staff.dto.spec.ts
 * Module: staff
 * Purpose: DTO validation smoke tests.
 */

import { validate } from 'class-validator';
import { CreateStaffDto } from '../create-staff.dto';

describe('CreateStaffDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateStaffDto(), {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      employeeId: 'EMP-001',
      joinDate: '2024-01-15',
      name: 'ok',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

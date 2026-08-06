/**
 * File: create-consultation.dto.spec.ts
 * Module: consultations
 * Purpose: DTO validation smoke tests.
 */

import { validate } from 'class-validator';
import { CreateConsultationDto } from '../create-consultation.dto';

describe('CreateConsultationDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateConsultationDto(), {
      patientId: '550e8400-e29b-41d4-a716-446655440000',
      doctorId: '550e8400-e29b-41d4-a716-446655440001',
      createdBy: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Fever',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

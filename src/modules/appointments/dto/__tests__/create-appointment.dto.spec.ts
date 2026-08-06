/**
 * File: create-appointment.dto.spec.ts
 * Module: appointments
 * Purpose: DTO validation smoke tests.
 */

import { validate } from 'class-validator';
import { CreateAppointmentDto } from '../create-appointment.dto';

describe('CreateAppointmentDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateAppointmentDto(), {
      patientId: '550e8400-e29b-41d4-a716-446655440000',
      doctorId: '550e8400-e29b-41d4-a716-446655440001',
      appointmentDate: '2026-08-04',
      startTime: '2026-08-04T09:00:00.000Z',
      endTime: '2026-08-04T09:30:00.000Z',
      createdBy: '550e8400-e29b-41d4-a716-446655440002',
      name: 'CONSULTATION',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

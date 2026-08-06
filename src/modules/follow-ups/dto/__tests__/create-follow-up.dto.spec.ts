/**
 * File: create-follow-up.dto.spec.ts
 */

import { validate } from 'class-validator';
import { CreateFollowUpDto } from '../create-follow-up.dto';

const UUID = '00000000-0000-4000-8000-000000000001';

describe('CreateFollowUpDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateFollowUpDto(), {
      patientId: UUID,
      consultationId: UUID,
      followUpDate: '2026-09-01',
      reason: 'Review labs',
      createdBy: UUID,
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

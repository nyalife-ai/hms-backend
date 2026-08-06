/**
 * File: create-radiology.dto.spec.ts
 */

import { validate } from 'class-validator';
import { CreateRadiologyDto } from '../create-radiology.dto';

const UUID = '00000000-0000-4000-8000-000000000001';

describe('CreateRadiologyDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateRadiologyDto(), {
      name: 'RAD-2026-0001',
      patientId: UUID,
      scanTypeId: UUID,
      requestedBy: UUID,
      description: 'Suspected fracture',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

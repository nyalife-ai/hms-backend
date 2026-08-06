/**
 * File: create-vital-sign.dto.spec.ts
 */

import { validate } from 'class-validator';
import { CreateVitalSignDto } from '../create-vital-sign.dto';

const UUID = '00000000-0000-4000-8000-000000000001';

describe('CreateVitalSignDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateVitalSignDto(), {
      patientId: UUID,
      recordedBy: UUID,
      bloodPressure: '120/80',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

/**
 * File: create-procedure.dto.spec.ts
 */

import { validate } from 'class-validator';
import { CreateProcedureDto } from '../create-procedure.dto';

const UUID = '00000000-0000-4000-8000-000000000001';

describe('CreateProcedureDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateProcedureDto(), {
      description: 'Wound dressing',
      consultationId: UUID,
      patientId: UUID,
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

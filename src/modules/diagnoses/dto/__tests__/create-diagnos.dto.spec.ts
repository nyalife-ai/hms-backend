/**
 * File: create-diagnos.dto.spec.ts
 */

import { validate } from 'class-validator';
import { CreateDiagnosDto } from '../create-diagnos.dto';

const UUID = '00000000-0000-4000-8000-000000000001';

describe('CreateDiagnosDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateDiagnosDto(), {
      description: 'Type 2 diabetes mellitus',
      consultationId: UUID,
      patientId: UUID,
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

/**
 * File: create-patient.dto.spec.ts
 */

import { validate } from 'class-validator';
import { CreatePatientDto } from '../create-patient.dto';

describe('CreatePatientDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreatePatientDto(), {
      firstName: 'Amina',
      lastName: 'Okello',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects empty firstName', async () => {
    const dto = Object.assign(new CreatePatientDto(), {
      firstName: '',
      lastName: 'Okello',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});

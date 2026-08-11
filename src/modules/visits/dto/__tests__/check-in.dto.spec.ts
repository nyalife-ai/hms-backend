/**
 * Unit tests — front-desk CheckInDto (reason for visit + additional notes).
 */

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckInDto } from '../visits.dto';

function buildPayload(overrides: Record<string, unknown> = {}) {
  return {
    patientName: 'Jane Wanjiku',
    mrn: 'MRN-10042',
    age: 34,
    gender: 'Female',
    phone: '+254712345678',
    firstVisit: false,
    payment: { method: 'CASH' },
    reasonForVisit: 'Antenatal check',
    additionalNotes: 'Came with partner',
    ...overrides,
  };
}

describe('CheckInDto', () => {
  it('accepts reasonForVisit and additionalNotes', async () => {
    const dto = plainToInstance(CheckInDto, buildPayload());
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.reasonForVisit).toBe('Antenatal check');
    expect(dto.additionalNotes).toBe('Came with partner');
  });

  it('allows omitting optional reason/notes', async () => {
    const dto = plainToInstance(
      CheckInDto,
      buildPayload({
        reasonForVisit: undefined,
        additionalNotes: undefined,
      }),
    );
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects invalid payment method', async () => {
    const dto = plainToInstance(
      CheckInDto,
      buildPayload({ payment: { method: 'CRYPTO' } }),
    );
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('rejects missing patientName', async () => {
    const dto = plainToInstance(
      CheckInDto,
      buildPayload({ patientName: undefined }),
    );
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});

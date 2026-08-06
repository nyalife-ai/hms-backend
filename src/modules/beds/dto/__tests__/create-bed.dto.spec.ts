/**
 * File: create-bed.dto.spec.ts
 */

import { validate } from 'class-validator';
import { CreateBedDto } from '../create-bed.dto';

describe('CreateBedDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateBedDto(), {
      name: 'A-01',
      wardId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('requires wardId', async () => {
    const dto = Object.assign(new CreateBedDto(), { name: 'A-01' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});

/**
 * File: create-audit.dto.spec.ts
 * Module: audit
 * Purpose: DTO validation smoke tests.
 */

import { validate } from 'class-validator';
import { CreateAuditDto } from '../create-audit.dto';

describe('CreateAuditDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateAuditDto(), { name: 'ok' });
    expect(await validate(dto)).toHaveLength(0);
  });
});

/**
 * Ensures ValidationPipe can see FollowUpsQueryDto at runtime
 * (guards against `import type` erasing the class).
 */

import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { FollowUpsQueryDto } from '../dto';
import { FollowUpsController } from '../follow-ups.controller';
import * as fs from 'fs';
import * as path from 'path';

describe('FollowUpsQueryDto validation contract', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });

  async function transform(query: Record<string, unknown>) {
    return pipe.transform(query, {
      type: 'query',
      metatype: FollowUpsQueryDto,
    });
  }

  it('accepts page and limit and coerces them to numbers', async () => {
    const dto = (await transform({
      page: '1',
      limit: '50',
    })) as FollowUpsQueryDto;
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(50);
  });

  it('accepts search/status/from/to used by the Follow-ups UI', async () => {
    const dto = (await transform({
      page: '1',
      limit: '50',
      search: 'dennis',
      status: 'SCHEDULED',
      from: '2026-08-01',
      to: '2026-08-31',
    })) as FollowUpsQueryDto;
    expect(dto.search).toBe('dennis');
    expect(dto.status).toBe('SCHEDULED');
    expect(dto.from).toBe('2026-08-01');
    expect(dto.to).toBe('2026-08-31');
  });

  it('rejects unknown query keys (validation stays strict)', async () => {
    await expect(
      transform({ page: '1', limit: '50', bogus: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('controller value-imports FollowUpsQueryDto (not import type)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'follow-ups.controller.ts'),
      'utf8',
    );
    expect(src).toMatch(
      /import \{[^}]*FollowUpsQueryDto[^}]*\} from '\.\/dto\/follow-ups-query\.dto'/,
    );
    expect(src).not.toMatch(
      /import type \{[^}]*FollowUpsQueryDto[^}]*\}/,
    );
    // sanity: controller class still references the DTO
    expect(FollowUpsController.name).toBe('FollowUpsController');
  });
});

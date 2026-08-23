/**
 * Shared list pagination contract helpers.
 */

import {
  resolveListPagination,
  OffsetListQueryDto,
  PaginationQueryDto,
} from '../pagination-query.dto';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { CatalogPatientsQueryDto } from '../../../../modules/catalog/dto/catalog-query.dto';
import { LaboratoryRequestsQueryDto } from '../../../../modules/laboratory/dto/laboratory-list-query.dto';
import { FollowUpsQueryDto } from '../../../../modules/follow-ups/dto/follow-ups-query.dto';

describe('resolveListPagination', () => {
  it('prefers page/limit over take/skip', () => {
    expect(
      resolveListPagination({ page: '2', limit: '25', take: '99', skip: '0' }),
    ).toEqual({ page: 2, limit: 25, take: 25, skip: 25 });
  });

  it('derives page from legacy take/skip', () => {
    expect(resolveListPagination({ take: '20', skip: '40' })).toEqual({
      page: 3,
      limit: 20,
      take: 20,
      skip: 40,
    });
  });

  it('applies defaults and maxLimit', () => {
    expect(resolveListPagination({})).toEqual({
      page: 1,
      limit: 50,
      take: 50,
      skip: 0,
    });
    expect(resolveListPagination({ page: 1, limit: 9999, maxLimit: 100 })).toEqual(
      {
        page: 1,
        limit: 100,
        take: 100,
        skip: 0,
      },
    );
  });
});

describe('list query DTO ValidationPipe contracts', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });

  async function transform<T>(metatype: new () => T, query: Record<string, unknown>) {
    return pipe.transform(query, { type: 'query', metatype });
  }

  it('CatalogPatientsQueryDto accepts UI list params', async () => {
    const dto = (await transform(CatalogPatientsQueryDto, {
      page: '1',
      limit: '50',
      search: 'dennis',
      gender: 'Male',
      status: 'Active',
    })) as CatalogPatientsQueryDto;
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(50);
    expect(dto.search).toBe('dennis');
  });

  it('LaboratoryRequestsQueryDto accepts page/limit and take/skip', async () => {
    const byPage = (await transform(LaboratoryRequestsQueryDto, {
      page: '1',
      limit: '20',
      status: 'PENDING',
      search: 'x',
    })) as LaboratoryRequestsQueryDto;
    expect(byPage.page).toBe(1);
    expect(byPage.limit).toBe(20);

    const byTake = (await transform(LaboratoryRequestsQueryDto, {
      take: '20',
      skip: '0',
      priority: 'ROUTINE',
    })) as LaboratoryRequestsQueryDto;
    expect(byTake.take).toBe(20);
    expect(byTake.skip).toBe(0);
  });

  it('FollowUpsQueryDto still accepts page/limit used by Follow-ups UI', async () => {
    const dto = (await transform(FollowUpsQueryDto, {
      page: '1',
      limit: '50',
      from: '2026-08-01',
      to: '2026-08-31',
    })) as FollowUpsQueryDto;
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(50);
  });

  it('rejects unknown keys on PaginationQueryDto', async () => {
    await expect(
      transform(PaginationQueryDto, { page: '1', limit: '10', bogus: '1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('OffsetListQueryDto is a runtime class (not type-erased)', () => {
    expect(typeof OffsetListQueryDto).toBe('function');
    expect(OffsetListQueryDto.name).toBe('OffsetListQueryDto');
  });
});

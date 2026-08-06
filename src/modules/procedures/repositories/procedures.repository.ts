/**
 * File: procedures.repository.ts
 * ORM factory provider (Prisma-first for HMS).
 */

import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { PROCEDURES_REPOSITORY } from '../constants/procedures.constants';
import { PrismaProcedureRepository } from './prisma/prisma-procedure.repository';

export function resolveOrmType(config: ConfigService): 'prisma' | 'typeorm' {
  const raw =
    config.get<string>('orm.type') ??
    config.get<string>('ORM_TYPE') ??
    config.get<string>('ORM_PROVIDER') ??
    'prisma';
  const normalized = raw.toLowerCase();
  if (normalized === 'prisma' || normalized === 'typeorm') return normalized;
  throw new Error(`Unsupported ORM "${raw}" — expected prisma or typeorm`);
}

export const ProcedureRepositoryProvider: Provider = {
  provide: PROCEDURES_REPOSITORY,
  inject: [ConfigService, PrismaService],
  useFactory: (config: ConfigService, prisma: PrismaService) => {
    if (resolveOrmType(config) === 'prisma') {
      return new PrismaProcedureRepository(prisma);
    }
    throw new Error('Use ORM_PROVIDER=prisma for HMS modules');
  },
};

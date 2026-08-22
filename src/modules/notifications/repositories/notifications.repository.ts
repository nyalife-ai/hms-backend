/**
 * File: notifications.repository.ts
 * Module: notifications
 * Purpose: Prisma-only repository factory (matches patients module).
 */

import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../../../common/security/encryption.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NOTIFICATIONS_REPOSITORY } from '../constants/notifications.constants';
import { PrismaNotificationRepository } from './prisma/prisma-notification.repository';

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

export const NotificationRepositoryProvider: Provider = {
  provide: NOTIFICATIONS_REPOSITORY,
  inject: [ConfigService, PrismaService, EncryptionService],
  useFactory: (
    config: ConfigService,
    prisma: PrismaService,
    encryption: EncryptionService,
  ) => {
    if (resolveOrmType(config) === 'prisma') {
      return new PrismaNotificationRepository(prisma, encryption);
    }
    throw new Error('Use ORM_PROVIDER=prisma for HMS notifications module');
  },
};

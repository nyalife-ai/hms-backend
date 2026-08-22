/**
 * Nest wiring — in-app notifications + event-driven SMS/FCM/WS via Bull + Redis.
 * Reuses platform SmsService / RealtimeService; provider secrets from env.
 */

import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../../common/security/encryption.service';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { SmsService } from '../../platform/messaging/sms/sms.service';
import { AuthModule } from '../auth/auth.module';
import { AfricasTalkingSmsAdapter } from './adapters/africastalking-sms.adapter';
import { loadAfricasTalkingOptions } from './adapters/africastalking.config';
import { NotificationAdapter } from './adapters/notification.adapter';
import {
  NOTIFICATIONS_REPOSITORY,
  NOTIFICATIONS_SMS_PROVIDER,
  NOTIFICATIONS_QUEUE,
} from './constants/notifications.constants';
import { NotificationDispatcherService } from './dispatch/notification-dispatcher.service';
import { DomainNotificationListener } from './listeners/domain-notification.listener';
import { NotificationsListener } from './listeners/notifications.listener';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationPolicyService } from './policy/notification-policy.service';
import { NotificationsProcessor } from './processors/notifications.processor';
import { RecipientResolverService } from './recipients/recipient-resolver.service';
import { NotificationRepositoryProvider } from './repositories/notifications.repository';
import { PrismaNotificationRepository } from './repositories/prisma/prisma-notification.repository';
import { CreateNotificationUseCase } from './use-cases/create-notification.usecase';
import { FindNotificationByIdUseCase } from './use-cases/find-notification-by-id.usecase';
import { FindAllNotificationsUseCase } from './use-cases/find-all-notifications.usecase';
import { UpdateNotificationUseCase } from './use-cases/update-notification.usecase';
import { SoftDeleteNotificationUseCase } from './use-cases/soft-delete-notification.usecase';
import { SendSmsUseCase } from './use-cases/send-sms.usecase';
import { DeviceTokensService } from './services/device-tokens.service';
import { DurableNotificationService } from './services/durable-notification.service';
import { FcmService } from './services/fcm.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE.NAME }),
  ],
  controllers: [NotificationsController],
  providers: [
    EncryptionService,
    NotificationsService,
    NotificationsListener,
    DomainNotificationListener,
    NotificationRepositoryProvider,
    PrismaNotificationRepository,
    CreateNotificationUseCase,
    FindNotificationByIdUseCase,
    FindAllNotificationsUseCase,
    UpdateNotificationUseCase,
    SoftDeleteNotificationUseCase,
    SendSmsUseCase,
    NotificationAdapter,
    RecipientResolverService,
    NotificationPolicyService,
    NotificationDispatcherService,
    NotificationsProcessor,
    DeviceTokensService,
    DurableNotificationService,
    FcmService,
    {
      provide: NOTIFICATIONS_SMS_PROVIDER,
      useValue: 'africastalking',
    },
    {
      provide: SmsService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const options = loadAfricasTalkingOptions(config);
        const providers = options
          ? [new AfricasTalkingSmsAdapter(options)]
          : [];
        return new SmsService(providers);
      },
    },
  ],
  exports: [
    NotificationsService,
    NOTIFICATIONS_REPOSITORY,
    NotificationAdapter,
    SmsService,
    NotificationDispatcherService,
    DeviceTokensService,
    FcmService,
  ],
})
export class NotificationsModule {}

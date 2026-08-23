/**
 * Staff messaging / communication module.
 * Reuses Prisma, Auth, Notifications, platform Realtime + STORAGE_PROVIDER.
 */

import { Module } from '@nestjs/common';
import { EncryptionService } from '../../common/security/encryption.service';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommunicationController } from './communication.controller';
import { MessagingSocketGateway } from './gateways/messaging-socket.gateway';
import { MessagePayloadService } from './services/message-payload.service';
import { MessagingService } from './services/messaging.service';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  controllers: [CommunicationController],
  providers: [
    EncryptionService,
    MessagePayloadService,
    MessagingService,
    MessagingSocketGateway,
  ],
  exports: [MessagingService],
})
export class CommunicationModule {}

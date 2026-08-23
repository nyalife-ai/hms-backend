/**
 * Messaging Socket.IO handlers on /realtime — send + delivery ack over WS.
 */

import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { MessagingService } from '../services/messaging.service';

type SendMessageSocketBody = {
  conversationId?: string;
  body?: string;
  messageType?: string;
  parentMessageId?: string;
  clientMessageId?: string;
  attachmentRefs?: Array<{
    key: string;
    fileName: string;
    mimeType?: string;
    fileSize?: number;
  }>;
};

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/realtime',
})
export class MessagingSocketGateway {
  private readonly logger = new Logger(MessagingSocketGateway.name);

  public constructor(
    private readonly messaging: MessagingService,
    private readonly prisma: PrismaService,
  ) {}

  @SubscribeMessage('message.send')
  public async onSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SendMessageSocketBody,
  ): Promise<{ ok: boolean; message?: unknown; reason?: string }> {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) return { ok: false, reason: 'unauthorized' };
    if (!this.prisma.isConnected) return { ok: false, reason: 'unavailable' };

    const conversationId = body?.conversationId?.trim();
    if (!conversationId) return { ok: false, reason: 'invalid_payload' };

    try {
      const message = await this.messaging.sendMessage(userId, conversationId, {
        body: body.body,
        messageType: body.messageType as never,
        parentMessageId: body.parentMessageId,
        clientMessageId: body.clientMessageId,
        attachmentRefs: body.attachmentRefs,
      });
      return { ok: true, message };
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'send_failed';
      this.logger.debug(
        `message.send failed user=${userId} conv=${conversationId}: ${reason}`,
      );
      return { ok: false, reason };
    }
  }

  @SubscribeMessage('message.ack.delivered')
  public async onAckDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageIds?: string[] },
  ): Promise<{ ok: boolean; updated?: number; reason?: string }> {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) return { ok: false, reason: 'unauthorized' };

    const messageIds = Array.isArray(body?.messageIds)
      ? body.messageIds.filter((id): id is string => typeof id === 'string')
      : [];
    if (!messageIds.length) return { ok: false, reason: 'invalid_payload' };

    try {
      const result = await this.messaging.markDelivered(userId, messageIds);
      return { ok: true, updated: result.updated };
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'ack_failed';
      this.logger.debug(
        `message.ack.delivered failed user=${userId}: ${reason}`,
      );
      return { ok: false, reason };
    }
  }
}

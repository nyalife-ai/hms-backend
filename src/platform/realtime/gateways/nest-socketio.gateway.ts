/**
 * Nest Socket.IO gateway — JWT-authenticated realtime channel.
 * Joins user:{userId} automatically; department rooms require role membership.
 * Conversation rooms require active ConversationParticipants membership.
 */

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, Optional } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { RealtimeGatewayHandler } from './realtime.gateway';
import { RealtimeService } from '../realtime.service';

const DEPARTMENT_ROOMS: Record<string, string[]> = {
  laboratory: ['LAB_TECHNICIAN', 'ADMIN', 'DOCTOR'],
  pharmacy: ['PHARMACIST', 'ADMIN', 'DOCTOR'],
  radiology: ['RADIOLOGIST', 'ADMIN', 'DOCTOR'],
  billing: ['ACCOUNTANT', 'RECEPTIONIST', 'ADMIN'],
  ipd: ['NURSE', 'DOCTOR', 'ADMIN'],
};

const CONVERSATION_ROOM_RE =
  /^conversation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/realtime',
})
export class NestSocketIoGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NestSocketIoGateway.name);

  @WebSocketServer()
  server!: Server;

  public constructor(
    private readonly realtime: RealtimeService,
    @Optional() private readonly gateway?: RealtimeGatewayHandler,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  public async handleConnection(client: Socket): Promise<void> {
    const token =
      (client.handshake.auth?.token as string | undefined) ||
      (client.handshake.query?.token as string | undefined) ||
      this.bearer(client.handshake.headers.authorization);

    if (!this.gateway) {
      this.logger.warn('RealtimeGatewayHandler missing — rejecting socket');
      client.disconnect(true);
      return;
    }

    const result = await this.gateway.handleConnect(
      {
        id: client.id,
        send: async (eventType, payload) => {
          client.emit(eventType, payload);
        },
        close: async () => {
          client.disconnect(true);
        },
      },
      {
        credentials: token,
        headers: {
          authorization: token ? `Bearer ${token}` : undefined,
        },
        query: { token: token ?? '' },
      },
    );

    if (!result.accepted || !result.identity?.userId) {
      this.logger.debug(`socket rejected ${client.id}: ${result.reason}`);
      client.disconnect(true);
      return;
    }

    const userId = result.identity.userId;
    const roles = (result.identity.roles ?? []).map((r) =>
      String(r).toUpperCase(),
    );
    (client.data as { userId?: string; roles?: string[]; connectionId?: string }).userId =
      userId;
    (client.data as { roles?: string[] }).roles = roles;
    (client.data as { connectionId?: string }).connectionId =
      result.connectionId;

    await client.join(`user:${userId}`);
    await this.gateway.handleJoin(result.connectionId!, `user:${userId}`);
    this.server?.emit('presence.updated', {
      type: 'presence.updated',
      payload: { userId, status: 'online' },
    });
    this.logger.debug(`socket connected ${client.id} user=${userId}`);
  }

  public async handleDisconnect(client: Socket): Promise<void> {
    const data = client.data as { connectionId?: string; userId?: string };
    const connectionId = data.connectionId;
    const userId = data.userId;
    if (connectionId && this.gateway) {
      await this.gateway.handleDisconnect(connectionId);
    }
    if (userId) {
      const presence = this.realtime.getPresence();
      const stillOnline = presence?.isOnline(userId) ?? false;
      if (!stillOnline) {
        const lastSeenAt =
          presence?.get(userId)?.lastSeenAt?.toISOString() ??
          new Date().toISOString();
        this.server?.emit('presence.updated', {
          type: 'presence.updated',
          payload: { userId, status: 'offline', lastSeenAt },
        });
      }
    }
    this.logger.debug(`socket disconnected ${client.id}`);
  }

  @SubscribeMessage('join')
  public async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { room?: string },
  ): Promise<{ ok: boolean; reason?: string }> {
    const room = (body?.room || '').trim();
    if (!room) return { ok: false, reason: 'room_required' };

    const userId = (client.data as { userId?: string }).userId;
    const roles = (client.data as { roles?: string[] }).roles ?? [];
    const connectionId = (client.data as { connectionId?: string })
      .connectionId;

    if (!userId || !connectionId) {
      return { ok: false, reason: 'unauthorized' };
    }

    // Users may always (re)join their private room.
    if (room === `user:${userId}`) {
      await client.join(room);
      await this.gateway?.handleJoin(connectionId, room);
      return { ok: true };
    }

    if (CONVERSATION_ROOM_RE.test(room)) {
      const conversationId = room.slice('conversation:'.length);
      const allowed = await this.isConversationParticipant(
        userId,
        conversationId,
      );
      if (!allowed) {
        this.logger.warn(
          `Denied conversation room join user=${userId} room=${room}`,
        );
        return { ok: false, reason: 'forbidden' };
      }
      await client.join(room);
      await this.gateway?.handleJoin(connectionId, room);
      return { ok: true };
    }

    const allowedRoles = DEPARTMENT_ROOMS[room];
    if (!allowedRoles) {
      return { ok: false, reason: 'unknown_room' };
    }
    const allowed = roles.some((r) => allowedRoles.includes(r));
    if (!allowed) {
      this.logger.warn(
        `Denied room join user=${userId} room=${room} roles=${roles.join(',')}`,
      );
      return { ok: false, reason: 'forbidden' };
    }

    await client.join(room);
    await this.gateway?.handleJoin(connectionId, room);
    return { ok: true };
  }

  @SubscribeMessage('leave')
  public async onLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { room?: string },
  ): Promise<{ ok: true }> {
    const room = body?.room;
    const connectionId = (client.data as { connectionId?: string })
      .connectionId;
    if (room) {
      await client.leave(room);
      if (connectionId) await this.gateway?.handleLeave(connectionId, room);
    }
    return { ok: true };
  }

  @SubscribeMessage('typing')
  public async onTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { conversationId?: string; state?: 'started' | 'stopped' },
  ): Promise<{ ok: boolean; reason?: string }> {
    const userId = (client.data as { userId?: string }).userId;
    const conversationId = body?.conversationId?.trim();
    const state = body?.state;
    if (!userId) return { ok: false, reason: 'unauthorized' };
    if (!conversationId || (state !== 'started' && state !== 'stopped')) {
      return { ok: false, reason: 'invalid_payload' };
    }

    const allowed = await this.isConversationParticipant(
      userId,
      conversationId,
    );
    if (!allowed) return { ok: false, reason: 'forbidden' };

    const displayName = await this.resolveDisplayName(userId);
    const room = `conversation:${conversationId}`;
    const eventType =
      state === 'started'
        ? 'message.typing.started'
        : 'message.typing.stopped';
    client.to(room).emit(eventType, {
      conversationId,
      userId,
      displayName,
      state,
    });
    return { ok: true };
  }

  @SubscribeMessage('presence.heartbeat')
  public onPresenceHeartbeat(
    @ConnectedSocket() client: Socket,
  ): { ok: boolean; reason?: string } {
    const userId = (client.data as { userId?: string }).userId;
    const connectionId = (client.data as { connectionId?: string })
      .connectionId;
    if (!userId || !connectionId) {
      return { ok: false, reason: 'unauthorized' };
    }
    this.realtime.heartbeat(connectionId);
    return { ok: true };
  }

  /** Bridge platform realtime publish into Socket.IO rooms when state changes. */
  public publishToRoom(room: string, event: string, payload: unknown): void {
    if (!this.realtime) return;
    this.server?.to(room).emit(event, payload);
  }

  private async resolveDisplayName(userId: string): Promise<string> {
    if (!this.prisma?.isConnected) return 'Someone';
    try {
      const user = await this.prisma.user.findFirst({
        where: { id: userId },
        include: { core_profiles_user_id: true },
      });
      if (!user) return 'Someone';
      const profile = user.core_profiles_user_id[0];
      const fromProfile = profile
        ? `${profile.first_name} ${profile.last_name}`.trim()
        : '';
      return fromProfile || user.email || 'Someone';
    } catch {
      return 'Someone';
    }
  }

  private async isConversationParticipant(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    if (!this.prisma?.isConnected) return false;
    try {
      const row = await this.prisma.conversationParticipants.findFirst({
        where: {
          conversation_id: conversationId,
          user_id: userId,
          left_at: null,
        },
        select: { id: true },
      });
      return Boolean(row);
    } catch (err) {
      this.logger.warn(
        `Conversation membership check failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  private bearer(header?: string): string | undefined {
    if (!header) return undefined;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined;
    return token;
  }
}

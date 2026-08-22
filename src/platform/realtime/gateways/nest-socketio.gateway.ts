/**
 * Nest Socket.IO gateway — JWT-authenticated realtime channel.
 * Joins user:{userId} automatically; department rooms require role membership.
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
import { RealtimeGatewayHandler } from './realtime.gateway';
import { RealtimeService } from '../realtime.service';

const DEPARTMENT_ROOMS: Record<string, string[]> = {
  laboratory: ['LAB_TECHNICIAN', 'ADMIN', 'DOCTOR'],
  pharmacy: ['PHARMACIST', 'ADMIN', 'DOCTOR'],
  radiology: ['RADIOLOGIST', 'ADMIN', 'DOCTOR'],
  billing: ['ACCOUNTANT', 'RECEPTIONIST', 'ADMIN'],
  ipd: ['NURSE', 'DOCTOR', 'ADMIN'],
};

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
    this.logger.debug(`socket connected ${client.id} user=${userId}`);
  }

  public async handleDisconnect(client: Socket): Promise<void> {
    const connectionId = (client.data as { connectionId?: string })
      .connectionId;
    if (connectionId && this.gateway) {
      await this.gateway.handleDisconnect(connectionId);
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

  /** Bridge platform realtime publish into Socket.IO rooms when state changes. */
  public publishToRoom(room: string, event: string, payload: unknown): void {
    if (!this.realtime) return;
    this.server?.to(room).emit(event, payload);
  }

  private bearer(header?: string): string | undefined {
    if (!header) return undefined;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined;
    return token;
  }
}

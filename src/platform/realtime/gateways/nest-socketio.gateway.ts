/**
 * Nest Socket.IO gateway — modules depend on RealtimeService, not socket.io.
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
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { RealtimeService } from '../realtime.service';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/realtime',
})
export class NestSocketIoGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NestSocketIoGateway.name);
  private readonly realtime: RealtimeService;

  @WebSocketServer()
  server!: Server;

  public constructor(realtime: RealtimeService) {
    this.realtime = realtime;
  }

  public handleConnection(client: Socket): void {
    const room = (client.handshake.query.room as string) || 'lobby';
    void client.join(room);
    this.logger.debug(`socket connected ${client.id} room=${room}`);
  }

  public handleDisconnect(client: Socket): void {
    this.logger.debug(`socket disconnected ${client.id}`);
  }

  @SubscribeMessage('join')
  public onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { room?: string },
  ): { ok: true } {
    const room = body?.room || 'lobby';
    void client.join(room);
    return { ok: true };
  }

  @SubscribeMessage('leave')
  public onLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { room?: string },
  ): { ok: true } {
    if (body?.room) void client.leave(body.room);
    return { ok: true };
  }

  /** Bridge platform realtime publish into Socket.IO rooms when state changes. */
  public publishToRoom(room: string, event: string, payload: unknown): void {
    if (!this.realtime) return;
    this.server?.to(room).emit(event, payload);
  }
}

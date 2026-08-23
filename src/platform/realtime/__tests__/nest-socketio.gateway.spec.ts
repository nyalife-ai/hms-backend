import { NestSocketIoGateway } from '../gateways/nest-socketio.gateway';
import type { RealtimeGatewayHandler } from '../gateways/realtime.gateway';
import type { RealtimeService } from '../realtime.service';
import type { Socket } from 'socket.io';

describe('NestSocketIoGateway', () => {
  const realtime = {
    getPresence: jest.fn().mockReturnValue({
      isOnline: () => false,
      get: () => ({ lastSeenAt: new Date('2026-08-23T12:00:00Z') }),
    }),
    heartbeat: jest.fn(),
  } as unknown as RealtimeService;
  let gatewayHandler: {
    handleConnect: jest.Mock;
    handleJoin: jest.Mock;
    handleLeave: jest.Mock;
    handleDisconnect: jest.Mock;
  };
  let gateway: NestSocketIoGateway;
  let client: Socket;

  beforeEach(() => {
    jest.clearAllMocks();
    gatewayHandler = {
      handleConnect: jest.fn().mockResolvedValue({
        accepted: true,
        connectionId: 'conn-1',
        identity: { userId: 'u1', roles: ['LAB_TECHNICIAN'] },
      }),
      handleJoin: jest.fn().mockResolvedValue(true),
      handleLeave: jest.fn().mockResolvedValue(true),
      handleDisconnect: jest.fn().mockResolvedValue(true),
    };
    gateway = new NestSocketIoGateway(
      realtime,
      gatewayHandler as unknown as RealtimeGatewayHandler,
    );
    gateway.server = { emit: jest.fn(), to: jest.fn() } as never;
    client = {
      id: 'c1',
      data: {},
      handshake: { query: {}, auth: { token: 'jwt' }, headers: {} },
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Socket;
  });

  it('authenticates and joins user room on connect', async () => {
    await gateway.handleConnection(client);
    expect(gatewayHandler.handleConnect).toHaveBeenCalled();
    expect(client.join).toHaveBeenCalledWith('user:u1');
    expect(gatewayHandler.handleJoin).toHaveBeenCalledWith('conn-1', 'user:u1');
    expect(gateway.server.emit).toHaveBeenCalledWith(
      'presence.updated',
      expect.objectContaining({
        type: 'presence.updated',
        payload: { userId: 'u1', status: 'online' },
      }),
    );
  });

  it('rejects unauthorized connections', async () => {
    gatewayHandler.handleConnect.mockResolvedValue({
      accepted: false,
      reason: 'unauthorized',
    });
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('handles disconnect and emits offline presence', async () => {
    (client.data as { connectionId?: string; userId?: string }).connectionId =
      'conn-1';
    (client.data as { userId?: string }).userId = 'u1';
    await gateway.handleDisconnect(client);
    expect(gatewayHandler.handleDisconnect).toHaveBeenCalledWith('conn-1');
    expect(gateway.server.emit).toHaveBeenCalledWith(
      'presence.updated',
      expect.objectContaining({
        payload: expect.objectContaining({
          userId: 'u1',
          status: 'offline',
        }),
      }),
    );
  });

  it('allows authorized department room join', async () => {
    (client.data as { userId?: string; roles?: string[]; connectionId?: string }).userId =
      'u1';
    (client.data as { roles?: string[] }).roles = ['LAB_TECHNICIAN'];
    (client.data as { connectionId?: string }).connectionId = 'conn-1';
    await expect(gateway.onJoin(client, { room: 'laboratory' })).resolves.toEqual({
      ok: true,
    });
    expect(client.join).toHaveBeenCalledWith('laboratory');
  });

  it('denies unauthorized department room join', async () => {
    (client.data as { userId?: string; roles?: string[]; connectionId?: string }).userId =
      'u1';
    (client.data as { roles?: string[] }).roles = ['PATIENT'];
    (client.data as { connectionId?: string }).connectionId = 'conn-1';
    await expect(gateway.onJoin(client, { room: 'laboratory' })).resolves.toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('onLeave leaves room when provided', async () => {
    (client.data as { connectionId?: string }).connectionId = 'conn-1';
    await expect(gateway.onLeave(client, { room: 'laboratory' })).resolves.toEqual({
      ok: true,
    });
    expect(client.leave).toHaveBeenCalledWith('laboratory');
  });

  it('publishToRoom emits via socket server', () => {
    const emit = jest.fn();
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit }),
    } as never;
    gateway.publishToRoom('ipd', 'ipd.admitted', { id: 1 });
    expect(gateway.server.to).toHaveBeenCalledWith('ipd');
    expect(emit).toHaveBeenCalledWith('ipd.admitted', { id: 1 });
  });
});

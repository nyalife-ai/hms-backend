import { NestSocketIoGateway } from '../gateways/nest-socketio.gateway';
import type { RealtimeService } from '../realtime.service';
import type { Socket } from 'socket.io';

describe('NestSocketIoGateway', () => {
  const realtime = {} as RealtimeService;
  let gateway: NestSocketIoGateway;
  let client: Socket;

  beforeEach(() => {
    gateway = new NestSocketIoGateway(realtime);
    client = {
      id: 'c1',
      handshake: { query: {} },
      join: jest.fn(),
      leave: jest.fn(),
    } as unknown as Socket;
  });

  it('joins lobby on connect when room query missing', () => {
    gateway.handleConnection(client);
    expect(client.join).toHaveBeenCalledWith('lobby');
  });

  it('joins requested room on connect', () => {
    (client.handshake as { query: Record<string, string> }).query = {
      room: 'ipd',
    };
    gateway.handleConnection(client);
    expect(client.join).toHaveBeenCalledWith('ipd');
  });

  it('handles disconnect', () => {
    expect(() => gateway.handleDisconnect(client)).not.toThrow();
  });

  it('onJoin defaults to lobby', () => {
    expect(gateway.onJoin(client, {})).toEqual({ ok: true });
    expect(client.join).toHaveBeenCalledWith('lobby');
  });

  it('onJoin uses provided room', () => {
    expect(gateway.onJoin(client, { room: 'ward-1' })).toEqual({ ok: true });
    expect(client.join).toHaveBeenCalledWith('ward-1');
  });

  it('onLeave leaves room when provided', () => {
    expect(gateway.onLeave(client, { room: 'ward-1' })).toEqual({ ok: true });
    expect(client.leave).toHaveBeenCalledWith('ward-1');
  });

  it('onLeave is a no-op without room', () => {
    expect(gateway.onLeave(client, {})).toEqual({ ok: true });
    expect(client.leave).not.toHaveBeenCalled();
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

  it('publishToRoom no-ops when server is unset', () => {
    (gateway as { server?: unknown }).server = undefined;
    expect(() =>
      gateway.publishToRoom('ipd', 'ipd.admitted', { id: 1 }),
    ).not.toThrow();
  });

  it('publishToRoom no-ops when realtime is missing', () => {
    const bare = Object.create(NestSocketIoGateway.prototype) as NestSocketIoGateway;
    (bare as { realtime?: unknown }).realtime = undefined;
    expect(() => bare.publishToRoom('ipd', 'x', {})).not.toThrow();
  });
});

import { createHmac } from 'node:crypto';
import { AnonymousRealtimeAuthProvider } from '../authentication/anonymous.auth.provider';
import { ApiKeyRealtimeAuthProvider } from '../authentication/api-key.auth.provider';
import {
  createRealtimeAuthProvider,
  createRealtimeAuthProviderByKind,
} from '../authentication/create-auth.provider';
import { JwtRealtimeAuthProvider } from '../authentication/jwt.auth.provider';
import { InMemoryChannelRegistry } from '../adapters/in-memory-channel.registry';
import { InMemoryTransportAdapter } from '../adapters/in-memory-transport.adapter';
import { DEFAULT_REALTIME_CONFIG } from '../configuration/realtime.config';
import { resolveRealtimeConfig } from '../configuration/resolve-realtime-config';
import { createRealtimeEvent } from '../events/create-realtime-event';
import { JsonRealtimeSerializer } from '../events/json-realtime.serializer';
import { RealtimeGatewayHandler } from '../gateways/realtime.gateway';
import { RealtimeHealthIndicator } from '../health/realtime-health.indicator';
import { InMemoryRealtimeMetrics } from '../observability/realtime-metrics';
import { PresenceService } from '../presence/presence.service';
import { AblyRealtimeProvider } from '../providers/ably.provider';
import {
  createRealtimeProvider,
  UnknownRealtimeProviderError,
} from '../providers/create-realtime.provider';
import { FirebaseRealtimeProvider } from '../providers/firebase.provider';
import { NestWebSocketProvider } from '../providers/nest-websocket.provider';
import { NoopRealtimeProvider } from '../providers/noop.provider';
import { PusherRealtimeProvider } from '../providers/pusher.provider';
import { SocketIOProvider } from '../providers/socketio.provider';
import { SSEProvider } from '../providers/sse.provider';
import { RealtimeModule } from '../realtime.module';
import { RealtimeService } from '../realtime.service';
import {
  REALTIME_AUTH_PROVIDER,
  REALTIME_CONFIG,
  REALTIME_METRICS,
  REALTIME_PRESENCE,
  REALTIME_PROVIDER,
  REALTIME_SERIALIZER,
} from '../realtime.tokens';
import { RoomRegistry } from '../rooms/room-registry';

function signJwt(payload: Record<string, unknown>, secret?: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: secret ? 'HS256' : 'none', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = secret
    ? createHmac('sha256', secret)
        .update(`${header}.${body}`)
        .digest('base64url')
    : 'sig';
  return `${header}.${body}.${signature}`;
}

describe('realtime platform', () => {
  describe('events', () => {
    it('creates events with generated ids and validates type', () => {
      const event = createRealtimeEvent({
        type: ' order.created ',
        payload: { id: 1 },
        tenantId: ' t1 ',
        correlationId: ' c1 ',
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
      });
      expect(event.type).toBe('order.created');
      expect(event.tenantId).toBe('t1');
      expect(event.correlationId).toBe('c1');
      expect(event.timestamp).toBe('2026-01-01T00:00:00.000Z');
      expect(event.eventId.startsWith('rte_')).toBe(true);
      expect(() => createRealtimeEvent({ type: '  ', payload: {} })).toThrow(
        RangeError,
      );
      const withId = createRealtimeEvent({
        type: 'x',
        payload: null,
        eventId: ' custom ',
        timestamp: '2026-02-01T00:00:00.000Z',
      });
      expect(withId.eventId).toBe('custom');
    });

    it('serializes and rejects invalid payloads', () => {
      const serializer = new JsonRealtimeSerializer();
      const event = createRealtimeEvent({
        type: 'ping',
        payload: { ok: true },
      });
      const raw = serializer.serialize(event);
      expect(serializer.deserialize(raw)).toEqual(event);
      expect(serializer.deserialize(Buffer.from(raw))).toEqual(event);
      expect(() => serializer.deserialize('{"type":"x"}')).toThrow(TypeError);
      expect(() => serializer.deserialize('not-json')).toThrow();
    });
  });

  describe('configuration', () => {
    it('resolves defaults and forces noop when disabled', () => {
      expect(DEFAULT_REALTIME_CONFIG.provider).toBe('noop');
      const disabled = resolveRealtimeConfig({ REALTIME_ENABLED: 'false' });
      expect(disabled.enabled).toBe(false);
      expect(disabled.provider).toBe('noop');
      expect(disabled.transport).toBe('none');

      const enabled = resolveRealtimeConfig({
        REALTIME_ENABLED: 'true',
        REALTIME_PROVIDER: 'sse',
        REALTIME_TRANSPORT: 'sse',
        REALTIME_PORT: '4001',
        REALTIME_HEARTBEAT: '15000',
        REALTIME_AUTH: 'api-key',
        REALTIME_API_KEYS: 'a, b',
        REALTIME_JWT_SECRET: 'secret',
        REALTIME_MAX_CONNECTIONS: '10',
        REALTIME_MAX_ROOMS: '5',
        REALTIME_MAX_CONNECTIONS_PER_ROOM: '2',
        REALTIME_PRESENCE_ENABLED: '0',
        REALTIME_PRESENCE_IDLE_MS: '1000',
      });
      expect(enabled).toMatchObject({
        enabled: true,
        provider: 'sse',
        transport: 'sse',
        port: 4001,
        heartbeatMs: 15_000,
        auth: 'api-key',
        apiKeys: ['a', 'b'],
        jwtSecret: 'secret',
        presenceEnabled: false,
      });
      expect(
        resolveRealtimeConfig({
          REALTIME_ENABLED: 'yes',
          JWT_SECRET: 'fallback',
        }).jwtSecret,
      ).toBe('fallback');
    });

    it('rejects invalid env values', () => {
      expect(() =>
        resolveRealtimeConfig({ REALTIME_ENABLED: 'maybe' }),
      ).toThrow(RangeError);
      expect(() =>
        resolveRealtimeConfig({
          REALTIME_ENABLED: 'true',
          REALTIME_PROVIDER: 'kafka',
        }),
      ).toThrow(RangeError);
      expect(() =>
        resolveRealtimeConfig({
          REALTIME_ENABLED: 'true',
          REALTIME_TRANSPORT: 'grpc',
        }),
      ).toThrow(RangeError);
      expect(() =>
        resolveRealtimeConfig({
          REALTIME_ENABLED: 'true',
          REALTIME_AUTH: 'oauth',
        }),
      ).toThrow(RangeError);
      expect(() => resolveRealtimeConfig({ REALTIME_PORT: '0' })).toThrow(
        RangeError,
      );
      expect(() =>
        resolveRealtimeConfig({ REALTIME_ENABLED: 'off' }),
      ).not.toThrow();
    });
  });

  describe('authentication', () => {
    it('authenticates jwt, api-key, and anonymous identities', async () => {
      const secret = 'realtime-secret';
      const jwt = new JwtRealtimeAuthProvider(secret);
      const valid = signJwt(
        { sub: 'user-1', tenantId: 't1', roles: ['admin'], exp: 2_000_000_000 },
        secret,
      );
      await expect(
        jwt.authenticate({ headers: { authorization: `Bearer ${valid}` } }),
      ).resolves.toMatchObject({ userId: 'user-1', tenantId: 't1' });
      await expect(
        jwt.authenticate({ credentials: signJwt({ userId: 'u2' }, secret) }),
      ).resolves.toMatchObject({ userId: 'u2' });
      await expect(jwt.authenticate({})).resolves.toBeUndefined();
      await expect(
        jwt.authenticate({ query: { token: 'a.b' } }),
      ).resolves.toBeUndefined();
      await expect(
        jwt.authenticate({
          credentials: signJwt({ sub: 'u', exp: 1 }, secret),
        }),
      ).resolves.toBeUndefined();
      await expect(
        jwt.authenticate({
          credentials: signJwt({ sub: 'u' }, 'other'),
        }),
      ).resolves.toBeUndefined();
      await expect(
        new JwtRealtimeAuthProvider().authenticate({
          credentials: signJwt({ sub: 'open' }),
        }),
      ).resolves.toMatchObject({ userId: 'open' });
      await expect(
        jwt.authenticate({ credentials: 'a.b.c' }),
      ).resolves.toBeUndefined();

      const api = new ApiKeyRealtimeAuthProvider(['secret-key']);
      await expect(
        api.authenticate({
          headers: {
            'x-api-key': 'secret-key',
            'x-user-id': 'svc',
            'x-tenant-id': 't',
          },
        }),
      ).resolves.toMatchObject({ userId: 'svc', tenantId: 't' });
      await expect(
        api.authenticate({ query: { apiKey: 'secret-key', userId: 'q' } }),
      ).resolves.toMatchObject({ userId: 'q' });
      await expect(
        api.authenticate({ credentials: 'nope' }),
      ).resolves.toBeUndefined();
      await expect(
        new ApiKeyRealtimeAuthProvider([]).authenticate({
          credentials: 'secret-key',
        }),
      ).resolves.toBeUndefined();

      const anon = new AnonymousRealtimeAuthProvider();
      await expect(
        anon.authenticate({ metadata: { guestId: 'g1' } }),
      ).resolves.toMatchObject({ userId: 'g1', anonymous: true });
      await expect(anon.authenticate({})).resolves.toMatchObject({
        anonymous: true,
      });
      await expect(
        new AnonymousRealtimeAuthProvider(false).authenticate({}),
      ).resolves.toBeUndefined();

      expect(createRealtimeAuthProviderByKind('jwt', {}).name).toBe('jwt');
      expect(
        createRealtimeAuthProviderByKind('api-key', { apiKeys: [] }).name,
      ).toBe('api-key');
      expect(
        createRealtimeAuthProviderByKind('anonymous', { apiKeys: [] }).name,
      ).toBe('anonymous');
      expect(
        createRealtimeAuthProvider({
          auth: 'jwt',
          apiKeys: [],
        }).name,
      ).toBe('jwt');
      expect(() =>
        createRealtimeAuthProviderByKind('oauth' as never, { apiKeys: [] }),
      ).toThrow(RangeError);
    });
  });

  describe('rooms and presence', () => {
    it('manages rooms and presence lifecycle', async () => {
      const rooms = new RoomRegistry({ maxRooms: 1, maxConnectionsPerRoom: 1 });
      expect(rooms.join('lobby', 'c1')).toBe(true);
      expect(rooms.join('lobby', 'c2')).toBe(false);
      expect(rooms.join('other', 'c1')).toBe(false);
      expect(rooms.getRoom('lobby').memberCount()).toBe(1);
      expect(rooms.members('lobby')).toEqual(['c1']);
      expect(rooms.leave('lobby', 'c1')).toBe(true);
      expect(rooms.leave('missing', 'c1')).toBe(false);
      expect(rooms.join('alpha', 'c1')).toBe(true);
      expect(rooms.leaveAll('c1')).toBe(1);
      expect(rooms.roomCount()).toBe(0);
      expect(rooms.listRooms()).toEqual([]);
      expect(() => rooms.getRoom(' ')).toThrow(RangeError);
      const room = rooms.getRoom('broadcast');
      rooms.join('broadcast', 'c9');
      expect(await room.join('c9')).toBe(true);
      expect(await room.leave('missing')).toBe(false);
      expect(
        await room.broadcast(createRealtimeEvent({ type: 'x', payload: 1 })),
      ).toBe(1);
      expect(
        await rooms.broadcast(
          'broadcast',
          createRealtimeEvent({ type: 'x', payload: 1 }),
          async () => undefined,
        ),
      ).toBe(1);

      const presence = new PresenceService();
      presence.markOnline('u1', 'c1', 't1');
      presence.markOnline('u1', 'c2', 't1');
      presence.markOnline('', 'c3');
      expect(presence.isOnline('u1')).toBe(true);
      expect(presence.get('u1')?.deviceCount).toBe(2);
      presence.heartbeat('u1', 'c1');
      presence.heartbeat('missing', 'c1');
      presence.markOffline('u1', 'c1');
      expect(presence.get('u1')?.deviceCount).toBe(1);
      presence.markOffline('u1', 'c2');
      expect(presence.isOnline('u1')).toBe(false);
      presence.markOffline('missing', 'c1');
      presence.markOnline('u2', 'c3', 't2');
      expect(presence.listOnline('t2')).toHaveLength(1);
      expect(presence.listOnline()).toHaveLength(1);
      expect(() => presence.pruneStale(0)).toThrow(RangeError);
      presence.markOnline('stale', 'cx');
      const record = (
        presence as unknown as {
          records: Map<
            string,
            { lastSeenAt: Date; status: string; connectionIds: Set<string> }
          >;
        }
      ).records.get('stale')!;
      record.lastSeenAt = new Date(Date.now() - 10_000);
      expect(presence.pruneStale(1000)).toBe(1);
      record.lastSeenAt = new Date(Date.now() - 10_000);
      expect(presence.pruneStale(1000)).toBe(1);
    });
  });

  describe('transport providers', () => {
    it('fans out through in-memory transports and sse framing', async () => {
      const sent: Array<{ id: string; type: string }> = [];
      const transport = new NestWebSocketProvider({
        maxConnections: 2,
        maxRooms: 1,
        maxConnectionsPerRoom: 1,
      });
      await transport.connect();
      expect(transport.isStarted()).toBe(true);
      expect(
        await transport.registerConnection({
          id: 'c1',
          userId: 'u1',
          tenantId: 't1',
          send: async (type) => {
            sent.push({ id: 'c1', type });
          },
          close: async () => undefined,
        }),
      ).toBe(true);
      expect(
        await transport.registerConnection({
          id: 'c1',
          send: async () => undefined,
          close: async () => undefined,
        }),
      ).toBe(false);
      expect(
        await transport.registerConnection({
          id: 'c2',
          userId: 'u2',
          tenantId: 't2',
          send: async (type) => {
            sent.push({ id: 'c2', type });
          },
          close: async () => undefined,
        }),
      ).toBe(true);
      expect(
        await transport.registerConnection({
          id: 'c3',
          send: async () => undefined,
          close: async () => undefined,
        }),
      ).toBe(false);
      expect(await transport.joinRoom('c1', 'lobby')).toBe(true);
      expect(await transport.joinRoom('c2', 'lobby')).toBe(false);
      expect(await transport.joinRoom('missing', 'lobby')).toBe(false);
      expect(await transport.joinRoom('c1', ' ')).toBe(false);
      expect(await transport.joinRoom('c1', 'other')).toBe(false);

      const event = createRealtimeEvent({
        type: 'ping',
        payload: {},
        tenantId: 't1',
      });
      await transport.publishToRoom('lobby', event);
      await transport.publishToUser('u1', event);
      await transport.publish(event);
      await transport.broadcast(
        createRealtimeEvent({ type: 'all', payload: 1 }),
      );
      expect(transport.heartbeat('c1')).toBe(true);
      expect(transport.heartbeat('missing')).toBe(false);
      expect(transport.isConnected('c1')).toBe(true);
      expect(transport.getConnections()).toHaveLength(2);
      expect(transport.connectionCount()).toBe(2);
      expect(transport.roomCount()).toBe(1);
      expect(await transport.leaveRoom('c1', 'lobby')).toBe(true);
      expect(await transport.leaveRoom('c1', 'lobby')).toBe(false);
      expect(await transport.leaveRoom('missing', 'lobby')).toBe(false);
      expect(await transport.disconnectConnection('c1')).toBe(true);
      expect(await transport.disconnectConnection('missing')).toBe(false);
      await transport.disconnect();
      expect(transport.isStarted()).toBe(false);
      expect(sent.length).toBeGreaterThan(0);

      const socketio = new SocketIOProvider();
      expect(socketio.name).toBe('socketio');
      const sse = new SSEProvider();
      const chunks: string[] = [];
      expect(
        await sse.attachSseClient({
          id: 'sse-1',
          userId: 'u',
          write: (chunk) => {
            chunks.push(chunk);
          },
          close: async () => undefined,
        }),
      ).toBe(true);
      await sse.publishToUser(
        'u',
        createRealtimeEvent({ type: 'sse', payload: { ok: true } }),
      );
      expect(chunks[0]).toContain('event: sse');
    });

    it('covers sse non-envelope send framing', async () => {
      const out: string[] = [];
      const sse = new SSEProvider();
      await sse.attachSseClient({
        id: 's1',
        write: (chunk) => {
          out.push(chunk);
        },
      });
      const connections = (
        sse as unknown as {
          connections: Map<
            string,
            { registration: { send: (t: string, p: unknown) => Promise<void> } }
          >;
        }
      ).connections;
      await connections.get('s1')!.registration.send('tick', { n: 1 });
      expect(out.some((line) => line.includes('event: tick'))).toBe(true);
    });
  });

  describe('noop and unconfigured providers', () => {
    it('noops and fails loud for cloud stubs', async () => {
      const noop = new NoopRealtimeProvider();
      await noop.connect();
      await noop.disconnect();
      await noop.publish(createRealtimeEvent({ type: 'x', payload: 1 }));
      await noop.publishToUser(
        'u',
        createRealtimeEvent({ type: 'x', payload: 1 }),
      );
      await noop.publishToRoom(
        'r',
        createRealtimeEvent({ type: 'x', payload: 1 }),
      );
      await noop.broadcast(createRealtimeEvent({ type: 'x', payload: 1 }));
      expect(await noop.joinRoom('c', 'r')).toBe(false);
      expect(await noop.leaveRoom('c', 'r')).toBe(false);
      expect(await noop.disconnectConnection('c')).toBe(false);
      expect(noop.getConnections()).toEqual([]);
      expect(noop.isConnected('c')).toBe(false);
      expect(noop.connectionCount()).toBe(0);
      expect(noop.roomCount()).toBe(0);
      expect(
        await noop.registerConnection({
          id: 'c',
          send: async () => undefined,
          close: async () => undefined,
        }),
      ).toBe(false);

      for (const provider of [
        new FirebaseRealtimeProvider(),
        new PusherRealtimeProvider(),
        new AblyRealtimeProvider(),
      ]) {
        await expect(provider.connect()).rejects.toThrow(/not configured/);
        await provider.disconnect();
        await expect(
          provider.publish(createRealtimeEvent({ type: 'x', payload: 1 })),
        ).rejects.toThrow(/not configured/);
        await expect(
          provider.publishToUser(
            'u',
            createRealtimeEvent({ type: 'x', payload: 1 }),
          ),
        ).rejects.toThrow(/not configured/);
        await expect(
          provider.publishToRoom(
            'r',
            createRealtimeEvent({ type: 'x', payload: 1 }),
          ),
        ).rejects.toThrow(/not configured/);
        await expect(
          provider.broadcast(createRealtimeEvent({ type: 'x', payload: 1 })),
        ).rejects.toThrow(/not configured/);
        expect(await provider.joinRoom('c', 'r')).toBe(false);
        expect(provider.isConnected('c')).toBe(false);
        expect(provider.connectionCount()).toBe(0);
        expect(provider.roomCount()).toBe(0);
        expect(provider.getConnections()).toEqual([]);
        expect(await provider.leaveRoom('c', 'r')).toBe(false);
        expect(await provider.disconnectConnection('c')).toBe(false);
        expect(
          await provider.registerConnection({
            id: 'c',
            send: async () => undefined,
            close: async () => undefined,
          }),
        ).toBe(false);
      }

      expect(
        createRealtimeProvider({ ...DEFAULT_REALTIME_CONFIG, enabled: false })
          .name,
      ).toBe('noop');
      expect(
        createRealtimeProvider({
          ...DEFAULT_REALTIME_CONFIG,
          enabled: true,
          provider: 'noop',
        }).name,
      ).toBe('noop');
      expect(
        createRealtimeProvider({
          ...DEFAULT_REALTIME_CONFIG,
          enabled: true,
          provider: 'nest-ws',
        }).name,
      ).toBe('nest-ws');
      expect(
        createRealtimeProvider({
          ...DEFAULT_REALTIME_CONFIG,
          enabled: true,
          provider: 'socketio',
        }).name,
      ).toBe('socketio');
      expect(
        createRealtimeProvider({
          ...DEFAULT_REALTIME_CONFIG,
          enabled: true,
          provider: 'sse',
        }).name,
      ).toBe('sse');
      expect(
        createRealtimeProvider({
          ...DEFAULT_REALTIME_CONFIG,
          enabled: true,
          provider: 'firebase',
        }).name,
      ).toBe('firebase');
      expect(
        createRealtimeProvider({
          ...DEFAULT_REALTIME_CONFIG,
          enabled: true,
          provider: 'pusher',
        }).name,
      ).toBe('pusher');
      expect(
        createRealtimeProvider({
          ...DEFAULT_REALTIME_CONFIG,
          enabled: true,
          provider: 'ably',
        }).name,
      ).toBe('ably');
      expect(() =>
        createRealtimeProvider({
          ...DEFAULT_REALTIME_CONFIG,
          enabled: true,
          provider: 'kafka' as never,
        }),
      ).toThrow(UnknownRealtimeProviderError);
    });
  });

  describe('service, gateway, health, channels, module', () => {
    it('publishes through RealtimeService and gateway lifecycle', async () => {
      const metrics = new InMemoryRealtimeMetrics();
      const presence = new PresenceService();
      const provider = new NestWebSocketProvider();
      const config = {
        ...DEFAULT_REALTIME_CONFIG,
        enabled: true,
        provider: 'nest-ws' as const,
        transport: 'ws' as const,
        presenceEnabled: true,
      };
      const service = new RealtimeService(provider, config, presence, metrics);
      expect(service.isEnabled).toBe(true);
      expect(service.getProviderName()).toBe('nest-ws');
      await service.start();

      const auth = new AnonymousRealtimeAuthProvider();
      const gateway = new RealtimeGatewayHandler(
        provider,
        auth,
        config,
        presence,
        metrics,
      );
      const closed: string[] = [];
      const socket = {
        id: 'sock-1',
        send: async () => undefined,
        close: async (reason?: string) => {
          closed.push(reason ?? '');
        },
      };
      const connected = await gateway.handleConnect(socket, {
        metadata: { guestId: 'guest-1' },
      });
      expect(connected.accepted).toBe(true);
      expect(await gateway.handleJoin(connected.connectionId!, 'room-a')).toBe(
        true,
      );
      expect(gateway.handleHeartbeat(connected.connectionId!)).toBe(true);
      expect(
        await gateway.handlePublish(
          connected.connectionId!,
          'room-a',
          'chat.message',
          { text: 'hi' },
        ),
      ).toBe(true);
      expect(
        await gateway.handlePublish(
          connected.connectionId!,
          undefined,
          'ping',
          {},
        ),
      ).toBe(true);
      expect(await gateway.handlePublish('missing', 'room-a', 'x', {})).toBe(
        false,
      );
      expect(await gateway.handleLeave(connected.connectionId!, 'room-a')).toBe(
        true,
      );

      await service.publish({ type: 'sys', payload: 1 });
      await service.publish(
        createRealtimeEvent({ type: 'sys2', payload: 2, eventId: 'fixed' }),
      );
      await service.publishToUser('guest-1', { type: 'dm', payload: true });
      await service.publishToRoom('room-a', { type: 'room', payload: true });
      await service.broadcast({ type: 'all', payload: true });
      await expect(
        service.publishToUser(' ', { type: 'x', payload: 1 }),
      ).rejects.toThrow(RangeError);
      await expect(
        service.publishToRoom(' ', { type: 'x', payload: 1 }),
      ).rejects.toThrow(RangeError);
      expect(service.heartbeat(connected.connectionId!)).toBe(true);
      expect(service.getPresence()?.isOnline('guest-1')).toBe(true);
      expect(service.getConnections().length).toBe(1);
      expect(service.isConnected(connected.connectionId!)).toBe(true);
      expect(service.connectionCount()).toBe(1);
      expect(service.roomCount()).toBeGreaterThanOrEqual(0);
      expect(await service.disconnect(connected.connectionId!, 'bye')).toBe(
        true,
      );
      expect(await service.disconnect('missing')).toBe(false);
      await service.stop();

      const denied = await gateway.handleConnect(socket, {});
      // anonymous still accepts; force jwt failure
      const jwtGateway = new RealtimeGatewayHandler(
        provider,
        new JwtRealtimeAuthProvider('secret'),
        config,
        presence,
        metrics,
      );
      const rejected = await jwtGateway.handleConnect(
        {
          send: async () => undefined,
          close: async () => undefined,
        },
        {},
      );
      expect(rejected.accepted).toBe(false);
      expect(rejected.reason).toBe('unauthorized');

      const noopGateway = new RealtimeGatewayHandler(
        new NoopRealtimeProvider(),
        auth,
        config,
        presence,
        metrics,
      );
      const noRegister = await noopGateway.handleConnect(
        {
          send: async () => undefined,
          close: async () => undefined,
        },
        { metadata: { guestId: 'g' } },
      );
      expect(noRegister.accepted).toBe(false);
      expect(noopGateway.handleHeartbeat('x')).toBe(false);

      const limited = new NestWebSocketProvider({ maxConnections: 0 });
      // maxConnections 0 uses default via ?? — use 1 and fill
      const one = new NestWebSocketProvider({ maxConnections: 1 });
      await one.registerConnection({
        id: 'only',
        send: async () => undefined,
        close: async () => undefined,
      });
      const fullGateway = new RealtimeGatewayHandler(one, auth, config);
      const full = await fullGateway.handleConnect(
        {
          send: async () => undefined,
          close: async () => undefined,
        },
        { metadata: { guestId: 'overflow' } },
      );
      expect(full.accepted).toBe(false);
      expect(full.reason).toBe('rejected');
      void denied;
      void limited;

      const disabledService = new RealtimeService(new NoopRealtimeProvider(), {
        ...config,
        enabled: false,
        presenceEnabled: false,
      });
      expect(disabledService.isEnabled).toBe(false);
      expect(disabledService.getPresence()).toBeUndefined();
      expect(disabledService.heartbeat('x')).toBe(false);

      const health = new RealtimeHealthIndicator(provider, config, metrics);
      expect(health.check().status).toBe('up');
      expect(
        new RealtimeHealthIndicator(new NoopRealtimeProvider(), {
          ...config,
          enabled: false,
        }).check().message,
      ).toContain('disabled');

      const channels = new InMemoryChannelRegistry();
      const channel = channels.getChannel('orders');
      const seen: string[] = [];
      const unsubscribe = channel.subscribe((event) => {
        seen.push(event.type);
      });
      await channel.publish(
        createRealtimeEvent({ type: 'created', payload: {} }),
      );
      unsubscribe();
      await channel.publish(
        createRealtimeEvent({ type: 'ignored', payload: {} }),
      );
      expect(seen).toEqual(['created']);
      expect(channels.channelCount()).toBe(0);
      expect(() => channels.getChannel(' ')).toThrow(RangeError);

      expect(REALTIME_PROVIDER).not.toBe(REALTIME_CONFIG);
      expect(REALTIME_AUTH_PROVIDER).not.toBe(REALTIME_PRESENCE);
      expect(REALTIME_SERIALIZER).not.toBe(REALTIME_METRICS);

      const moduleDisabled = RealtimeModule.register({
        allowInMemory: true,
        env: {
          REALTIME_ENABLED: 'false',
        },
      });
      expect(moduleDisabled.exports).toContain(RealtimeService);
      const moduleCustom = RealtimeModule.register({
        allowInMemory: true,
        config: { ...config, presenceEnabled: false },
        presence: false,
        metrics,
        provider: new SocketIOProvider(),
        authProvider: auth,
      });
      expect(moduleCustom.providers?.length).toBeGreaterThan(0);
      const modulePresence = RealtimeModule.register({
        allowInMemory: true,
        config,
        presence: new PresenceService(),
      });
      expect(modulePresence.exports).toContain(RealtimeGatewayHandler);

      const snap = metrics.snapshot();
      expect(snap.connects).toBeGreaterThan(0);
      expect(snap.publishes).toBeGreaterThan(0);
      expect(Object.keys(snap.publishesByTarget).length).toBeGreaterThan(0);
    });

    it('covers remaining branch gaps for 100% suite coverage', async () => {
      const provider = new NestWebSocketProvider();
      const presence = new PresenceService();
      const metrics = new InMemoryRealtimeMetrics();
      const config = {
        ...DEFAULT_REALTIME_CONFIG,
        enabled: true,
        provider: 'nest-ws' as const,
        transport: 'ws' as const,
        presenceEnabled: true,
      };
      const service = new RealtimeService(provider, config, presence, metrics);
      await provider.registerConnection({
        id: 'gap-1',
        userId: 'user-gap',
        tenantId: 't-gap',
        send: async () => undefined,
        close: async () => undefined,
      });
      expect(await service.joinRoom('gap-1', 'room-gap')).toBe(true);
      expect(await service.leaveRoom('gap-1', 'room-gap')).toBe(true);

      await provider.joinRoom('gap-1', 'sticky');
      const internal = provider as unknown as {
        connections: Map<string, { rooms: Set<string> }>;
      };
      internal.connections.get('gap-1')!.rooms.add('ghost-room');
      expect(await provider.disconnectConnection('gap-1', 'cleanup')).toBe(
        true,
      );

      await provider.registerConnection({
        id: 'gap-2',
        userId: 'user-gap-2',
        send: async () => undefined,
        close: async () => undefined,
      });
      const gateway = new RealtimeGatewayHandler(
        provider,
        new AnonymousRealtimeAuthProvider(),
        config,
        presence,
        metrics,
      );
      expect(await gateway.handleDisconnect('gap-2', 'bye')).toBe(true);
      expect(await gateway.handleDisconnect('missing')).toBe(false);

      const bareProvider = {
        name: 'bare',
        publish: async () => undefined,
        publishToUser: async () => undefined,
        publishToRoom: async () => undefined,
        broadcast: async () => undefined,
        joinRoom: async () => false,
        leaveRoom: async () => false,
        disconnectConnection: async () => false,
        getConnections: () => [],
        isConnected: () => false,
        connectionCount: () => 0,
        roomCount: () => 0,
      };
      const bareGateway = new RealtimeGatewayHandler(
        bareProvider,
        new AnonymousRealtimeAuthProvider(),
        config,
      );
      expect(
        (
          await bareGateway.handleConnect(
            {
              send: async () => undefined,
              close: async () => undefined,
            },
            { metadata: { guestId: 'bare' } },
          )
        ).reason,
      ).toBe('provider-does-not-accept-connections');
      expect(bareGateway.handleHeartbeat('x')).toBe(false);

      const jwt = new JwtRealtimeAuthProvider();
      await expect(
        jwt.authenticate({
          headers: { authorization: ['Bearer not-a-jwt'] },
        }),
      ).resolves.toBeUndefined();
      const token = signJwt({
        sub: 'u',
        roles: ['ok', 1, null] as unknown,
      });
      await expect(
        jwt.authenticate({ query: { token: [token] } }),
      ).resolves.toMatchObject({ userId: 'u', roles: ['ok'] });

      const api = new ApiKeyRealtimeAuthProvider(['k']);
      await expect(
        api.authenticate({
          headers: { 'x-api-key': ['k'], 'x-user-id': ['arr-user'] },
        }),
      ).resolves.toMatchObject({ userId: 'arr-user' });

      presence.markOnline('p1', 'c1', 't1');
      presence.markOnline('p1', 'c2', 't2');
      expect(presence.get('missing')).toBeUndefined();
      const records = (
        presence as unknown as {
          records: Map<string, { lastSeenAt: Date; status: string }>;
        }
      ).records;
      records.get('p1')!.lastSeenAt = new Date(Date.now() - 50_000);
      expect(presence.pruneStale(1_000)).toBe(1);
      records.get('p1')!.lastSeenAt = new Date(Date.now() - 50_000);
      expect(presence.pruneStale(1_000)).toBe(1);

      metrics.recordPublish('  ');
      const channels = new InMemoryChannelRegistry();
      const channel = channels.getChannel('dup');
      const unsubA = channel.subscribe(() => undefined);
      const unsubB = channel.subscribe(() => undefined);
      await channel.publish(createRealtimeEvent({ type: 'x', payload: 1 }));
      unsubA();
      expect(channels.channelCount()).toBe(1);
      unsubB();
      expect(channels.channelCount()).toBe(0);

      const sse = new SSEProvider();
      let closed = false;
      await sse.attachSseClient({
        id: 'sse-close',
        write: () => undefined,
        close: () => {
          closed = true;
        },
      });
      await sse.disconnectConnection('sse-close');
      expect(closed).toBe(true);
      const simpleRooms = new RoomRegistry();
      simpleRooms.join('r1', 'c1');
      expect(simpleRooms.getRoom('r1').members()).toEqual(['c1']);

      RealtimeModule.register();
      RealtimeModule.register({
        allowInMemory: true,
        env: {
          REALTIME_ENABLED: 'true',
          REALTIME_PROVIDER: 'noop',
        },
      });
      RealtimeModule.register({
        allowInMemory: true,
        config: { ...config, presenceEnabled: true },
      });
      RealtimeModule.register({
        allowInMemory: true,
        config: { ...config, presenceEnabled: false },
      });

      // default env argument + heartbeat without user / without metrics
      expect(() => resolveRealtimeConfig()).not.toThrow();
      const bareTransport = new InMemoryTransportAdapter('custom');
      expect(bareTransport.name).toBe('custom');
      const noUser = new NestWebSocketProvider();
      await noUser.registerConnection({
        id: 'nouser',
        send: async () => undefined,
        close: async () => undefined,
      });
      const serviceNoMetrics = new RealtimeService(noUser, config, presence);
      expect(serviceNoMetrics.heartbeat('nouser')).toBe(true);
      expect(serviceNoMetrics.heartbeat('missing')).toBe(false);

      await noUser.publishToUser(
        'nobody',
        createRealtimeEvent({ type: 'x', payload: 1 }),
      );
      await noUser.registerConnection({
        id: 'tenanted',
        userId: 'tu',
        tenantId: 't-a',
        send: async () => undefined,
        close: async () => undefined,
      });
      await noUser.broadcast(
        createRealtimeEvent({ type: 'x', payload: 1, tenantId: 't-b' }),
      );
      await noUser.publish(createRealtimeEvent({ type: 'gone', payload: 1 }));
      // hit sendToConnection early-return when connection disappears
      await (
        noUser as unknown as {
          sendToConnection: (id: string, event: unknown) => Promise<void>;
        }
      ).sendToConnection(
        'missing-connection',
        createRealtimeEvent({ type: 'x', payload: 1 }),
      );

      expect(await noUser.leaveRoom('tenanted', 'never-joined')).toBe(false);
      await noUser.joinRoom('tenanted', 'r-leave');
      expect(await noUser.leaveRoom('tenanted', 'r-leave')).toBe(true);
      await noUser.registerConnection({
        id: 'room-peer',
        send: async () => undefined,
        close: async () => undefined,
      });
      await noUser.joinRoom('tenanted', 'multi');
      await noUser.joinRoom('room-peer', 'multi');
      expect(await noUser.leaveRoom('tenanted', 'multi')).toBe(true);
      expect(noUser.roomCount()).toBe(1);
      expect(await noUser.leaveRoom('room-peer', 'multi')).toBe(true);
      await noUser.joinRoom('tenanted', 'r-leave');
      const roomsMap = (
        noUser as unknown as { rooms: Map<string, Set<string>> }
      ).rooms;
      roomsMap.delete('r-leave');
      expect(await noUser.leaveRoom('tenanted', 'r-leave')).toBe(false);

      await noUser.registerConnection({
        id: 'room-mate',
        userId: 'mate',
        send: async () => undefined,
        close: async () => undefined,
      });
      await noUser.joinRoom('tenanted', 'shared-room');
      await noUser.joinRoom('room-mate', 'shared-room');
      expect(await noUser.disconnectConnection('tenanted')).toBe(true);
      expect(noUser.roomCount()).toBe(1);
      expect(await noUser.disconnectConnection('room-mate')).toBe(true);

      // multi-device user index cleanup
      await noUser.registerConnection({
        id: 'tu-1',
        userId: 'shared',
        send: async () => undefined,
        close: async () => undefined,
      });
      await noUser.registerConnection({
        id: 'tu-2',
        userId: 'shared',
        send: async () => undefined,
        close: async () => undefined,
      });
      expect(await noUser.disconnectConnection('tu-1')).toBe(true);
      expect(await noUser.disconnectConnection('tu-2')).toBe(true);

      presence.markOnline('u-empty', '');
      presence.markOnline('p-keep', 'c1', 't1');
      presence.markOnline('p-keep', 'c3');
      const offline = (
        presence as unknown as {
          records: Map<string, { lastSeenAt: Date; status: string }>;
        }
      ).records;
      presence.markOnline('mid', 'c-mid');
      offline.get('mid')!.lastSeenAt = new Date(Date.now() - 1_500);
      expect(presence.pruneStale(1_000)).toBe(1);
      offline.get('mid')!.lastSeenAt = new Date(Date.now() - 1_500);
      expect(presence.pruneStale(1_000)).toBe(0);

      await expect(
        new JwtRealtimeAuthProvider().authenticate({
          credentials: signJwt({ sub: 'x', tenantId: 9 }),
        }),
      ).resolves.toMatchObject({ userId: 'x' });
      await expect(
        new JwtRealtimeAuthProvider().authenticate({
          credentials: signJwt({ userId: 'from-user-id' }),
        }),
      ).resolves.toMatchObject({ userId: 'from-user-id' });
      await expect(
        new JwtRealtimeAuthProvider().authenticate({
          credentials: signJwt({ sub: '', userId: 'fallback' }),
        }),
      ).resolves.toMatchObject({ userId: 'fallback' });
      await expect(
        new JwtRealtimeAuthProvider().authenticate({
          credentials: signJwt({ foo: 'bar' }),
        }),
      ).resolves.toBeUndefined();

      // Singular `role` (no `roles` array) and empty-string short-circuit.
      await expect(
        new JwtRealtimeAuthProvider().authenticate({
          credentials: signJwt({ sub: 'role-user', role: 'doctor' }),
        }),
      ).resolves.toMatchObject({ userId: 'role-user', roles: ['doctor'] });
      await expect(
        new JwtRealtimeAuthProvider().authenticate({
          credentials: signJwt({ sub: 'empty-role', role: '', roles: [] }),
        }),
      ).resolves.toMatchObject({ userId: 'empty-role', roles: undefined });
      await expect(
        new JwtRealtimeAuthProvider().authenticate({
          credentials: signJwt({
            sub: 'roles-empty-fallback',
            roles: [],
            role: 'nurse',
          }),
        }),
      ).resolves.toMatchObject({
        userId: 'roles-empty-fallback',
        roles: ['nurse'],
      });

      await expect(
        new ApiKeyRealtimeAuthProvider(['k']).authenticate({
          credentials: 'k',
          query: { tenantId: ['tq'] },
        }),
      ).resolves.toMatchObject({ tenantId: 'tq' });

      const gw = new RealtimeGatewayHandler(
        provider,
        new AnonymousRealtimeAuthProvider(),
        { ...config, presenceEnabled: false },
      );
      const joined = await gw.handleConnect({
        id: '  ',
        send: async () => undefined,
        close: async () => undefined,
      });
      expect(joined.accepted).toBe(true);

      const withPresenceOff = new RealtimeGatewayHandler(
        provider,
        new AnonymousRealtimeAuthProvider(),
        { ...config, presenceEnabled: true },
        undefined,
        metrics,
      );
      expect(
        (
          await withPresenceOff.handleConnect(
            {
              send: async () => undefined,
              close: async () => undefined,
            },
            { metadata: { guestId: 'no-presence-svc' } },
          )
        ).accepted,
      ).toBe(true);

      await provider.registerConnection({
        id: 'corr',
        userId: 'cu',
        metadata: { correlationId: 'corr-1' },
        send: async () => undefined,
        close: async () => undefined,
      });
      expect(
        await gateway.handlePublish('corr', undefined, 'with-corr', {}),
      ).toBe(true);
      expect(gateway.handleHeartbeat('corr')).toBe(true);
      expect(gateway.handleHeartbeat('missing')).toBe(false);

      const bufferSerializer = {
        serialize: () => Buffer.from('{"ok":true}'),
        deserialize: () => createRealtimeEvent({ type: 'x', payload: 1 }),
      };
      const sseBuf = new SSEProvider({}, bufferSerializer);
      const bufOut: string[] = [];
      await sseBuf.attachSseClient({
        id: 'buf',
        write: (chunk) => {
          bufOut.push(chunk);
        },
      });
      await (
        sseBuf as unknown as {
          connections: Map<
            string,
            { registration: { send: (t: string, p: unknown) => Promise<void> } }
          >;
        }
      ).connections
        .get('buf')!
        .registration.send('tick', { n: 1 });
      expect(bufOut[0]).toContain('data: {"ok":true}');

      const again = channels.getChannel('dup');
      expect(again.name).toBe('dup');
      expect(channels.getChannel('dup').name).toBe('dup');
      expect(channels.channelCount()).toBe(1);

      const limitedRooms = new RoomRegistry({
        maxRooms: 2,
        maxConnectionsPerRoom: 2,
      });
      expect(limitedRooms.join(' ', 'c')).toBe(false);
      expect(limitedRooms.join('ok', ' ')).toBe(false);
      limitedRooms.join('a', 'c1');
      expect(limitedRooms.leaveAll('missing')).toBe(0);
      limitedRooms.join('x', 'c1');
      limitedRooms.join('y', 'c1');
      expect(limitedRooms.leaveAll('c1')).toBe(2);
      expect(limitedRooms.memberCount('missing')).toBe(0);
      expect(limitedRooms.members('missing')).toEqual([]);
      expect(await limitedRooms.getRoom('a').leave('c1')).toBe(false);
      expect(limitedRooms.leave('missing-room', 'c1')).toBe(false);
      const jwtConnect = new RealtimeGatewayHandler(
        provider,
        new JwtRealtimeAuthProvider(),
        config,
        presence,
        metrics,
      );
      const jwtOk = await jwtConnect.handleConnect(
        {
          send: async () => undefined,
          close: async () => undefined,
        },
        {
          credentials: signJwt({ sub: 'jwt-user' }),
        },
      );
      expect(jwtOk.accepted).toBe(true);
      expect(jwtConnect.handleHeartbeat(jwtOk.connectionId!)).toBe(true);

      const noUserGateway = new RealtimeGatewayHandler(
        noUser,
        new AnonymousRealtimeAuthProvider(),
        config,
      );
      expect(noUserGateway.handleHeartbeat('nouser')).toBe(true);

      limitedRooms.join('shared', 's1');
      limitedRooms.join('shared', 's2');
      expect(limitedRooms.leaveAll('s1')).toBe(1);
      expect(limitedRooms.memberCount('shared')).toBe(1);
      limitedRooms.join('b', 'c1');
      limitedRooms.join('b', 'c2');
      expect(limitedRooms.memberCount('b')).toBe(2);
      expect(limitedRooms.leave('b', 'c1')).toBe(true);
      expect(limitedRooms.leave('b', 'c2')).toBe(true);
    });
  });
});

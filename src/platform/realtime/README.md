# Realtime Platform

Reusable, provider-based realtime fan-out for the NestJS enterprise scaffold.

Business modules must **never** import Socket.IO, Nest WebSockets, SSE, Firebase,
Pusher, or Ably directly. They inject `RealtimeService` only.

## Architecture

```
Future module
    │
    ▼
RealtimeService  (facade)
    │
    ▼
RealtimeProvider  (port)
    ├── NoopRealtimeProvider        (default / disabled)
    ├── NestWebSocketProvider       (in-process + gateway bind)
    ├── SocketIOProvider
    ├── SSEProvider
    ├── FirebaseRealtimeProvider    (stub — fails loud)
    ├── PusherRealtimeProvider      (stub)
    └── AblyRealtimeProvider        (stub)
```

Supporting capabilities:

| Area | Role |
|---|---|
| `RealtimeGatewayHandler` | Auth, connect/join/leave/heartbeat/disconnect/publish — no business logic |
| `RealtimeAuthProvider` | `jwt` / `api-key` / `anonymous` |
| `RoomRegistry` | Generic room membership |
| `PresenceService` | Online/offline, last seen, multi-device, heartbeat prune |
| `RealtimeHealthIndicator` | Connections, rooms, memory, metrics snapshot |
| `InMemoryRealtimeMetrics` | Connect/disconnect/auth/publish counters |

## Configuration

```env
REALTIME_ENABLED=false
REALTIME_PROVIDER=noop
REALTIME_TRANSPORT=none
REALTIME_PORT=3001
REALTIME_HEARTBEAT=30000
REALTIME_AUTH=jwt
```

When `REALTIME_ENABLED=false`, the factory **always** selects `NoopRealtimeProvider`
so the application compiles and boots with no controllers failing.

## Nest wiring

```ts
import { RealtimeModule, RealtimeService } from '../platform/realtime';

@Module({
  imports: [
    RealtimeModule.register({
      // omit to read process.env; allowInMemory is fine for local/dev
      allowInMemory: true,
    }),
  ],
})
export class AppModule {}

@Injectable()
export class ExamplePublisher {
  public constructor(private readonly realtime: RealtimeService) {}

  public notifyUser(userId: string): Promise<unknown> {
    return this.realtime.publishToUser(userId, {
      type: 'notification.created',
      payload: { message: 'hello' },
      tenantId: 'tenant-1',
      correlationId: 'req-123',
    });
  }
}
```

## Binding a transport gateway

Delegate sockets to `RealtimeGatewayHandler` — do not put domain logic in the gateway:

```ts
// illustrative — lives in app bootstrap / infrastructure, not src/modules
const result = await gateway.handleConnect(socketAdapter, {
  headers: { authorization: 'Bearer …' },
});
await gateway.handleJoin(result.connectionId!, 'orders');
await gateway.handleHeartbeat(result.connectionId!);
await gateway.handleDisconnect(result.connectionId!);
```

SSE clients can use `SSEProvider.attachSseClient({ id, write, … })`.

## Custom provider

1. Implement `RealtimeProvider`.
2. Register it via `RealtimeModule.register({ provider: new MyProvider() })`
   or extend `createRealtimeProvider`.
3. Keep SDKs optional — throw a clear “not configured” error until credentials exist
   (see `UnconfiguredRealtimeProvider`).

## Event envelope

```ts
{
  eventId: string;
  type: string;
  timestamp: string; // ISO
  correlationId?: string;
  tenantId?: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
}
```

Use `createRealtimeEvent()` or pass a plain input object to `RealtimeService`
methods — the service normalizes both forms.

## Testing

```bash
yarn test:platform --runInBand
```

The suite covers providers, gateway, presence, auth, configuration, health, and
metrics with the platform’s 100% coverage gate.

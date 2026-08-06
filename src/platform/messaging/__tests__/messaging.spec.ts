import { NotFoundException } from '../../../core/exceptions/not-found.exception';
import { InMemoryMessageBroker } from '../brokers/in-memory-broker';
import {
  EmailProvider,
  EmailTransport,
} from '../email/email-provider.interface';
import { EmailService } from '../email/email.service';
import { SendGridEmailProvider } from '../email/sendgrid.provider';
import { SesEmailProvider } from '../email/ses.provider';
import { SmtpEmailProvider } from '../email/smtp.provider';
import { TemplateRenderer } from '../email/template-renderer';
import { MessagingModule } from '../messaging.module';
import { ApnsPushProvider } from '../push/apns.provider';
import { FcmPushProvider } from '../push/fcm.provider';
import { PushService } from '../push/push.service';
import { AfricasTalkingSmsProvider } from '../sms/africastalking.provider';
import { GenericHttpSmsProvider } from '../sms/generic-http-sms.provider';
import { SmsService } from '../sms/sms.service';
import { TwilioSmsProvider } from '../sms/twilio.provider';
import { VonageSmsProvider } from '../sms/vonage.provider';
import { InMemoryWebhookDeliveryStore } from '../webhooks/in-memory-delivery.store';
import { InMemoryWebhookSubscriptionRegistry } from '../webhooks/in-memory-subscription.registry';
import { ExponentialBackoffRetryPolicy } from '../webhooks/exponential-backoff-retry.policy';
import { WebhookDeliveryService } from '../webhooks/webhook-delivery.service';
import { WebhookSigner } from '../webhooks/webhook-signer';
import { supportsDeadLetterListing } from '../webhooks/webhook-store.interface';
import { HttpClient, RetryPolicy } from '../webhooks/webhook.types';
import { ConnectionManager } from '../websockets/connection-manager';
import { WebSocketConnection } from '../websockets/websocket.types';

const okClient = (status = 200, body = 'id'): HttpClient => ({
  request: jest.fn().mockResolvedValue({ status, body }),
});
const retry: RetryPolicy = {
  maxAttempts: 2,
  delay: jest.fn().mockResolvedValue(undefined),
};

describe('messaging platform', () => {
  it('signs timestamped webhooks and rejects tamper, stale, future, malformed', () => {
    const clock = { now: (): number => 1_000_000 };
    const signer = new WebhookSigner({ maxAgeMs: 5_000, clock });
    const { signature, timestamp } = signer.sign('payload', 'secret');
    expect(signature).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(timestamp).toBe(1_000_000);
    expect(signer.verify('payload', signature, 'secret', timestamp)).toBe(true);
    expect(signer.verify('tampered', signature, 'secret', timestamp)).toBe(
      false,
    );
    expect(signer.verify('payload', 'v1=deadbeef', 'secret', timestamp)).toBe(
      false,
    );
    expect(signer.verify('payload', '', 'secret', timestamp)).toBe(false);
    expect(signer.verify('payload', signature, '', timestamp)).toBe(false);
    expect(
      signer.verify('payload', 'not-a-signature', 'secret', timestamp),
    ).toBe(false);
    expect(signer.verify('payload', signature, 'secret', 'not-a-number')).toBe(
      false,
    );
    expect(signer.verify('payload', signature, 'secret', '')).toBe(false);
    expect(signer.verify('payload', signature, 'secret', 1.5)).toBe(false);
    expect(
      signer.verify('payload', signature, 'secret', String(timestamp)),
    ).toBe(true);
    expect(
      signer.verify(
        'payload',
        signature,
        'secret',
        String(Number.MAX_SAFE_INTEGER + 1),
      ),
    ).toBe(false);
    expect(signer.verify('payload', signature, 'secret', '  ')).toBe(false);
    expect(
      signer.verify('payload', signature, 'secret', null as unknown as string),
    ).toBe(false);

    clock.now = (): number => 1_000_000 + 5_001;
    expect(signer.verify('payload', signature, 'secret', timestamp)).toBe(
      false,
    );

    clock.now = (): number => 1_000_000;
    const future = signer.sign('payload', 'secret', 1_000_001);
    expect(
      signer.verify('payload', future.signature, 'secret', future.timestamp),
    ).toBe(false);

    expect(() => signer.sign('payload', '')).toThrow();
    expect(() => new WebhookSigner({ maxAgeMs: 0 })).toThrow();
    expect(() => signer.sign('payload', 'secret', Number.NaN)).toThrow();
  });

  it('delivers, tracks, signs, retries, times out and fails webhooks', async () => {
    const store = new InMemoryWebhookDeliveryStore();
    const client: HttpClient = {
      request: jest
        .fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({ status: 204 }),
    };
    const service = new WebhookDeliveryService(client, store, retry);
    const result = await service.deliver({
      id: '1',
      url: 'https://example.test',
      payload: { ok: true },
      secret: 's',
      timeoutMs: 5,
    });
    expect(result).toMatchObject({ status: 'delivered', attempts: 2 });
    expect(await store.find('1')).toEqual(result);
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-webhook-signature': expect.stringMatching(/^v1=[0-9a-f]{64}$/),
          'x-webhook-timestamp': expect.any(String),
        }),
      }),
    );

    const failed = await new WebhookDeliveryService(
      okClient(500),
      store,
      retry,
    ).deliver({ id: '2', url: 'https://example.test', payload: null });
    expect(failed).toMatchObject({ status: 'failed', attempts: 2 });
    expect(await store.find('missing')).toBeUndefined();
    await expect(
      service.deliver({ id: '', url: '', payload: null }),
    ).rejects.toThrow();
    const odd: HttpClient = { request: jest.fn().mockRejectedValue('bad') };
    expect(
      (
        await new WebhookDeliveryService(odd, store, {
          maxAttempts: 1,
          delay: async () => undefined,
        }).deliver({ id: '3', url: 'x', payload: 1 })
      ).error,
    ).toBe('Unknown delivery error');
    expect(
      (
        await new WebhookDeliveryService(okClient(100), store, {
          maxAttempts: 1,
          delay: async () => undefined,
        }).deliver({ id: '4', url: 'x', payload: 1 })
      ).status,
    ).toBe('failed');
  });

  it('replays a stored delivery and lists dead letters', async () => {
    const store = new InMemoryWebhookDeliveryStore();
    const client: HttpClient = {
      request: jest
        .fn()
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValueOnce({ status: 500 })
        .mockResolvedValueOnce({ status: 204 }),
    };
    const service = new WebhookDeliveryService(client, store, retry);
    const failed = await service.deliver({
      id: 'dead-1',
      url: 'https://example.test',
      payload: { ok: false },
    });
    expect(failed.status).toBe('failed');
    expect(supportsDeadLetterListing(store)).toBe(true);
    expect((await service.listDeadLetters()).map((d) => d.id)).toEqual([
      'dead-1',
    ]);

    const replayed = await service.replay('dead-1', { secret: 's' });
    expect(replayed).toMatchObject({ status: 'delivered', attempts: 1 });
    expect(client.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-webhook-signature': expect.stringMatching(/^v1=[0-9a-f]{64}$/),
        }),
      }),
    );
    expect(await service.listDeadLetters()).toEqual([]);

    await expect(service.replay('missing')).rejects.toThrow(NotFoundException);

    const storeWithoutDeadLetters = {
      save: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue(undefined),
    };
    expect(supportsDeadLetterListing(storeWithoutDeadLetters)).toBe(false);
    await expect(
      new WebhookDeliveryService(
        client,
        storeWithoutDeadLetters,
        retry,
      ).listDeadLetters(),
    ).rejects.toThrow('does not support dead-letter listing');
  });

  it('registers, activates, matches and removes webhook subscriptions', async () => {
    const registry = new InMemoryWebhookSubscriptionRegistry(() => 'sub-1');
    const subscription = await registry.register({
      url: 'https://example.test/hook',
      eventTypes: ['order.created'],
      secret: 'top-secret',
    });
    expect(subscription).toMatchObject({
      id: 'sub-1',
      active: true,
      eventTypes: ['order.created'],
    });
    expect(await registry.list()).toEqual([subscription]);
    expect(await registry.findByEventType('order.created')).toEqual([
      subscription,
    ]);
    expect(await registry.findByEventType('order.shipped')).toEqual([]);

    const deactivated = await registry.setActive('sub-1', false);
    expect(deactivated.active).toBe(false);
    expect(await registry.findByEventType('order.created')).toEqual([]);

    await expect(registry.setActive('missing', true)).rejects.toThrow(
      NotFoundException,
    );

    expect(await registry.unregister('sub-1')).toBe(true);
    expect(await registry.unregister('sub-1')).toBe(false);

    await expect(
      registry.register({ url: 'https://x', eventTypes: [] }),
    ).rejects.toThrow(RangeError);
  });

  it('matches wildcard subscriptions and defaults to a random id generator', async () => {
    const registry = new InMemoryWebhookSubscriptionRegistry();
    const subscription = await registry.register({
      url: 'https://example.test/hook',
      eventTypes: ['*'],
    });
    expect(typeof subscription.id).toBe('string');
    expect(subscription.id.length).toBeGreaterThan(0);
    expect(await registry.findByEventType('anything')).toEqual([subscription]);
  });

  it('publishes concurrently, acks, nacks, redelivers and unsubscribes', async () => {
    const broker = new InMemoryMessageBroker(1);
    const attempts: number[] = [];
    const unsubscribe = broker.subscribe<string>('topic', async (message) => {
      attempts.push(message.attempt);
      if (message.attempt === 1) await message.nack();
      else await message.ack();
    });
    broker.subscribe<string>('topic', async () => {
      throw new Error('handler');
    });
    await broker.publish('topic', 'value');
    expect(attempts).toEqual([1, 2]);
    unsubscribe();
    unsubscribe();
    const single = broker.subscribe('single', async (message) => {
      await message.ack();
    });
    const implicitAttempts: number[] = [];
    const implicit = broker.subscribe('implicit', async (message) => {
      implicitAttempts.push(message.attempt);
      // Intentionally unsettled — must nack/retry, never silent-ack.
    });
    await broker.publish('implicit', 'value');
    expect(implicitAttempts).toEqual([1, 2]);
    implicit();
    single();
    await broker.publish('empty', 'value');
    expect(() => broker.subscribe('', async () => undefined)).toThrow();
    await expect(broker.publish('', 'x')).rejects.toThrow();
    const noRetry = new InMemoryMessageBroker();
    noRetry.subscribe('x', async (message) => message.nack(false));
    await noRetry.publish('x', 1);
  });

  it('nacks when a handler returns without ack or nack', async () => {
    const broker = new InMemoryMessageBroker(2);
    const attempts: number[] = [];
    broker.subscribe('unsettled', async (message) => {
      attempts.push(message.attempt);
      if (message.attempt === 3) {
        await message.ack();
      }
    });
    await broker.publish('unsettled', { ok: true });
    expect(attempts).toEqual([1, 2, 3]);
  });

  it('renders templates safely and reports missing variables', () => {
    const renderer = new TemplateRenderer();
    expect(renderer.render('{{ value }}', { value: `<>&"'` })).toBe(
      '&lt;&gt;&amp;&quot;&#39;',
    );
    expect(renderer.render('{{nil}}', { nil: null })).toBe('');
    expect(renderer.render('{{u}}', { u: undefined })).toBe('');
    expect(renderer.render('{{n}}', { n: 7 })).toBe('7');
    expect(renderer.render('{{b}}', { b: true })).toBe('true');
    expect(renderer.render('{{g}}', { g: 1n })).toBe('1');
    expect(
      renderer.render('{{d}}', { d: new Date('2020-01-01T00:00:00.000Z') }),
    ).toBe('2020-01-01T00:00:00.000Z');
    expect(renderer.render('{{o}}', { o: { a: 1 } })).toBe('{&quot;a&quot;:1}');
    expect(() => renderer.render('{{missing}}', {})).toThrow(
      'Missing template variable',
    );
  });

  it('supports email adapters, selection, validation and recovery', async () => {
    const transport: EmailTransport = {
      send: jest
        .fn()
        .mockResolvedValue({ provider: 'x', messageId: '1', accepted: true }),
    };
    for (const provider of [
      new SmtpEmailProvider(transport),
      new SendGridEmailProvider(transport),
      new SesEmailProvider(transport),
    ]) {
      await expect(
        provider.send({ to: ['a'], from: 'b', subject: 'c' }),
      ).resolves.toBeDefined();
    }
    const recovering: EmailProvider = {
      name: 'recover',
      send: jest
        .fn()
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValue({
          provider: 'recover',
          messageId: '2',
          accepted: true,
        }),
    };
    const service = new EmailService([recovering]);
    await expect(
      service.send('recover', {
        to: ['a'],
        from: 'b',
        subject: 'c',
        template: '<b>{{x}}</b>',
        variables: { x: 'safe' },
      }),
    ).resolves.toMatchObject({ attempts: 2 });
    await expect(
      service.send('recover', { to: ['a'], from: 'b', subject: 'c' }),
    ).resolves.toBeDefined();
    await expect(
      service.send('recover', {
        to: ['a'],
        from: 'b',
        subject: 'c',
        template: 'constant',
      }),
    ).resolves.toBeDefined();
    await expect(
      service.send('missing', { to: ['a'], from: 'b', subject: 'c' }),
    ).rejects.toThrow();
    await expect(
      service.send('recover', { to: [], from: '', subject: '' }),
    ).rejects.toThrow();
    const broken: EmailProvider = {
      name: 'broken',
      send: jest.fn().mockRejectedValue('bad'),
    };
    await expect(
      new EmailService([broken], undefined, 1).send('broken', {
        to: ['a'],
        from: 'b',
        subject: 'c',
      }),
    ).rejects.toThrow('Email delivery failed');
    await expect(
      new EmailService(
        [
          {
            name: 'error',
            send: jest.fn().mockRejectedValue(new Error('email error')),
          },
        ],
        undefined,
        1,
      ).send('error', { to: ['a'], from: 'b', subject: 'c' }),
    ).rejects.toThrow('email error');
  });

  it('uses SMS HTTP adapters and retries failures', async () => {
    const options = {
      endpoint: 'https://sms.test',
      token: 't',
      client: okClient(),
    };
    for (const provider of [
      new GenericHttpSmsProvider(options),
      new TwilioSmsProvider(options),
      new VonageSmsProvider(options),
      new AfricasTalkingSmsProvider(options),
    ]) {
      await expect(
        provider.send({ to: '1', body: 'x' }),
      ).resolves.toMatchObject({ accepted: true });
    }
    expect(new AfricasTalkingSmsProvider(options).name).toBe('africastalking');
    await expect(
      new GenericHttpSmsProvider({
        ...options,
        token: undefined,
        client: okClient(500),
      }).send({ to: '1', body: 'x' }),
    ).rejects.toThrow();
    const recovering = new GenericHttpSmsProvider({
      ...options,
      client: {
        request: jest
          .fn()
          .mockRejectedValueOnce(new Error('down'))
          .mockResolvedValue({ status: 200 }),
      },
    });
    await expect(
      new SmsService([recovering]).send('generic-http', { to: '1', body: 'x' }),
    ).resolves.toBeDefined();
    await expect(
      new SmsService([]).send('none', { to: '1', body: 'x' }),
    ).rejects.toThrow();
    await expect(
      new SmsService([recovering]).send('generic-http', { to: '', body: '' }),
    ).rejects.toThrow();
    await expect(
      new SmsService(
        [{ name: 'bad', send: jest.fn().mockRejectedValue('bad') }],
        1,
      ).send('bad', { to: '1', body: 'x' }),
    ).rejects.toThrow('SMS delivery failed');
    await expect(
      new SmsService(
        [
          {
            name: 'error',
            send: jest.fn().mockRejectedValue(new Error('sms error')),
          },
        ],
        1,
      ).send('error', { to: '1', body: 'x' }),
    ).rejects.toThrow('sms error');
  });

  it('uses push adapters and facade retry paths', async () => {
    const options = {
      endpoint: 'https://push.test',
      token: 't',
      client: okClient(),
    };
    const fcm = new FcmPushProvider(options);
    const apns = new ApnsPushProvider({ ...options, token: undefined });
    const noBodyClient: HttpClient = {
      request: jest.fn().mockResolvedValue({ status: 200 }),
    };
    await expect(
      fcm.send({ token: '1', title: 't', body: 'b' }),
    ).resolves.toBeDefined();
    await expect(
      new FcmPushProvider({
        ...options,
        token: undefined,
        client: noBodyClient,
      }).send({ token: '1', title: 't', body: 'b' }),
    ).resolves.toMatchObject({ messageId: '' });
    await expect(
      apns.send({ token: '1', title: 't', body: 'b' }),
    ).resolves.toBeDefined();
    await expect(
      new ApnsPushProvider({ ...options, client: noBodyClient }).send({
        token: '1',
        title: 't',
        body: 'b',
      }),
    ).resolves.toMatchObject({ messageId: '' });
    await expect(
      new FcmPushProvider({ ...options, client: okClient(500) }).send({
        token: '1',
        title: 't',
        body: 'b',
      }),
    ).rejects.toThrow();
    await expect(
      new ApnsPushProvider({ ...options, client: okClient(500) }).send({
        token: '1',
        title: 't',
        body: 'b',
      }),
    ).rejects.toThrow();
    await expect(
      new PushService([fcm]).send('fcm', { token: '1', title: 't', body: 'b' }),
    ).resolves.toBeDefined();
    await expect(
      new PushService([]).send('x', { token: '1', title: 't', body: 'b' }),
    ).rejects.toThrow();
    await expect(
      new PushService([fcm]).send('fcm', { token: '', title: '', body: '' }),
    ).rejects.toThrow();
    await expect(
      new PushService(
        [{ name: 'bad', send: jest.fn().mockRejectedValue('bad') }],
        1,
      ).send('bad', { token: '1', title: 't', body: 'b' }),
    ).rejects.toThrow('Push delivery failed');
    await expect(
      new PushService(
        [
          {
            name: 'error',
            send: jest.fn().mockRejectedValue(new Error('push error')),
          },
        ],
        1,
      ).send('error', { token: '1', title: 't', body: 'b' }),
    ).rejects.toThrow('push error');
  });

  it('isolates authenticated websocket rooms by tenant', async () => {
    const sent: string[] = [];
    const connection = (id: string): WebSocketConnection => ({
      id,
      send: async (event): Promise<void> => {
        sent.push(`${id}:${event}`);
      },
      close: jest.fn().mockResolvedValue(undefined),
    });
    const pubSub = { publish: jest.fn().mockResolvedValue(undefined) };
    const manager = new ConnectionManager(
      async (socket) => {
        if (socket.id === 'denied') return undefined;
        const [tenantId, principalId] = socket.id.split('-');
        return { tenantId: tenantId ?? '', principalId: principalId ?? '' };
      },
      async (_identity, room, action) =>
        room !== 'forbidden' &&
        !(room === 'readonly' && action === 'broadcast'),
      pubSub,
      { maxConnections: 4, maxRooms: 3, maxConnectionsPerRoom: 2 },
    );
    expect(await manager.connect(connection('denied'))).toBe(false);
    expect(await manager.connect(connection(''))).toBe(false);
    expect(await manager.connect(connection('alpha-a'))).toBe(true);
    expect(await manager.connect(connection('alpha-b'))).toBe(true);
    expect(await manager.connect(connection('beta-c'))).toBe(true);
    expect(await manager.connect(connection('alpha-a'))).toBe(false);
    expect(await manager.join('missing', 'room')).toBe(false);
    expect(await manager.join('alpha-a', '')).toBe(false);
    expect(await manager.join('alpha-a', 'forbidden')).toBe(false);
    expect(await manager.join('alpha-a', 'shared')).toBe(true);
    expect(await manager.join('alpha-b', 'shared')).toBe(true);
    expect(await manager.join('alpha-b', 'shared')).toBe(true);
    expect(await manager.join('beta-c', 'shared')).toBe(true);
    expect(manager.roomCount()).toBe(2);
    const internals = manager as unknown as {
      readonly rooms: Map<string, Set<string>>;
    };
    internals.rooms.get('alpha:shared')?.add('beta-c');
    expect(
      await manager.broadcastRoom('alpha-a', 'shared', 'alpha-room', {}),
    ).toBe(true);
    expect(
      await manager.broadcastRoom('beta-c', 'shared', 'beta-room', {}),
    ).toBe(true);
    expect(
      await manager.broadcastRoom('alpha-a', 'readonly', 'blocked', {}),
    ).toBe(false);
    expect(
      await manager.broadcastRoom('missing', 'shared', 'blocked', {}),
    ).toBe(false);
    expect(await manager.broadcastRoom('alpha-a', '', 'blocked', {})).toBe(
      false,
    );
    expect(await manager.broadcastTenant('alpha-a', 'tenant', {})).toBe(true);
    expect(await manager.broadcastTenant('missing', 'none', {})).toBe(false);
    expect(sent).toEqual([
      'alpha-a:alpha-room',
      'alpha-b:alpha-room',
      'beta-c:beta-room',
      'alpha-a:tenant',
      'alpha-b:tenant',
    ]);
    expect(pubSub.publish).toHaveBeenCalledWith(
      'tenant:alpha:shared',
      'alpha-room',
      {},
    );
    expect(manager.leave('missing', 'shared')).toBe(false);
    expect(manager.leave('alpha-a', 'missing')).toBe(false);
    expect(manager.leave('alpha-a', 'shared')).toBe(true);
    expect(manager.leave('alpha-a', 'shared')).toBe(false);
    expect(await manager.join('alpha-a', 'solo')).toBe(true);
    expect(manager.leave('alpha-a', 'solo')).toBe(true);
    expect(await manager.disconnect('missing')).toBe(false);
    expect(await manager.disconnect('alpha-b')).toBe(true);
    expect(await manager.disconnect('beta-c')).toBe(true);
    expect(await manager.disconnect('alpha-a')).toBe(true);
    expect(manager.count()).toBe(0);
    expect(manager.roomCount()).toBe(0);
    expect(await new ConnectionManager().connect(connection('default'))).toBe(
      false,
    );
    const defaultRoomAuthorization = new ConnectionManager(async () => ({
      principalId: 'default',
      tenantId: 'alpha',
    }));
    expect(await defaultRoomAuthorization.connect(connection('default'))).toBe(
      true,
    );
    expect(await defaultRoomAuthorization.join('default', 'room')).toBe(false);
  });

  it('bounds websocket connections and rooms', async () => {
    const connection = (id: string): WebSocketConnection => ({
      id,
      send: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    });
    const authenticate = async (socket: WebSocketConnection) => {
      if (socket.id === 'invalid-principal')
        return { tenantId: 'alpha', principalId: ' ' };
      if (socket.id === 'invalid-tenant')
        return { tenantId: ' ', principalId: 'user' };
      return { tenantId: 'alpha', principalId: socket.id };
    };
    const manager = new ConnectionManager(
      authenticate,
      async () => true,
      undefined,
      { maxConnections: 2, maxRooms: 1, maxConnectionsPerRoom: 1 },
    );
    expect(await manager.connect(connection('invalid-principal'))).toBe(false);
    expect(await manager.connect(connection('invalid-tenant'))).toBe(false);
    expect(await manager.connect(connection('one'))).toBe(true);
    expect(await manager.connect(connection('two'))).toBe(true);
    expect(await manager.connect(connection('three'))).toBe(false);
    expect(await manager.join('one', 'room')).toBe(true);
    expect(await manager.join('two', 'room')).toBe(false);
    expect(await manager.join('two', 'other')).toBe(false);
    expect(await manager.broadcastRoom('one', 'absent', 'event', null)).toBe(
      true,
    );
    expect(
      () =>
        new ConnectionManager(authenticate, async () => true, undefined, {
          maxConnections: 0,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new ConnectionManager(authenticate, async () => true, undefined, {
          maxRooms: 1.5,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new ConnectionManager(authenticate, async () => true, undefined, {
          maxConnectionsPerRoom: Number.MAX_SAFE_INTEGER + 1,
        }),
    ).toThrow(RangeError);
  });

  it('wires module defaults and configured providers', () => {
    const defaults = MessagingModule.register();
    expect(defaults.providers).toHaveLength(7);
    const webhookProvider = (
      defaults.providers as ReadonlyArray<{
        readonly provide?: unknown;
        readonly useValue?: unknown;
      }>
    ).find((provider) => provider.provide === WebhookDeliveryService);
    const defaultWebhook = webhookProvider?.useValue as WebhookDeliveryService;
    return expect(
      defaultWebhook.deliver({ id: 'default', url: 'x', payload: null }),
    )
      .resolves.toMatchObject({ status: 'failed' })
      .then(() => {
        expect(
          MessagingModule.register({
            httpClient: okClient(),
            retryPolicy: retry,
            broker: new InMemoryMessageBroker(),
            emailProviders: [],
            smsProviders: [],
            pushProviders: [],
          }).exports,
        ).toHaveLength(7);
      });
  });

  it('fails fast in production without durable messaging providers', async () => {
    expect(() => MessagingModule.register({ isProduction: true })).toThrow(
      /concrete broker/,
    );
    expect(() =>
      MessagingModule.register({
        isProduction: true,
        broker: new InMemoryMessageBroker(),
      }),
    ).toThrow(/not durable/);
    expect(() =>
      MessagingModule.register({
        isProduction: true,
        allowInMemory: true,
      }),
    ).not.toThrow();
    expect(() =>
      MessagingModule.register({
        isProduction: true,
        enableWebhooks: false,
        broker: { publish: async () => 'id', subscribe: () => () => undefined },
      }),
    ).not.toThrow();
    expect(() => new InMemoryWebhookDeliveryStore({ maxEntries: 0 })).toThrow(
      RangeError,
    );

    const durableBroker = {
      publish: async (): Promise<string> => 'id',
      subscribe: (): (() => void) => () => undefined,
    };
    expect(() =>
      MessagingModule.register({
        isProduction: true,
        broker: durableBroker,
      }),
    ).toThrow(/durable deliveryStore/);
    expect(() =>
      MessagingModule.register({
        isProduction: true,
        broker: durableBroker,
        deliveryStore: new InMemoryWebhookDeliveryStore(),
      }),
    ).toThrow(/InMemoryWebhookDeliveryStore is not durable/);
    expect(() =>
      MessagingModule.register({
        isProduction: true,
        broker: durableBroker,
        deliveryStore: {
          save: async () => undefined,
          find: async () => undefined,
        },
      }),
    ).toThrow(/retryPolicy/);
    expect(() =>
      MessagingModule.register({
        isProduction: true,
        broker: durableBroker,
        deliveryStore: {
          save: async () => undefined,
          find: async () => undefined,
        },
        retryPolicy: {
          maxAttempts: 2,
          delay: (): Promise<void> => Promise.resolve(),
        },
      }),
    ).toThrow(/noop delay/);
    expect(() =>
      MessagingModule.register({
        isProduction: true,
        broker: durableBroker,
        deliveryStore: {
          save: async () => undefined,
          find: async () => undefined,
        },
        retryPolicy: new ExponentialBackoffRetryPolicy({
          maxAttempts: 2,
          baseDelayMs: 0,
          jitter: 0,
        }),
      }),
    ).toThrow(/httpClient is required/);
    expect(() =>
      MessagingModule.register({
        isProduction: true,
        broker: durableBroker,
        deliveryStore: {
          save: async () => undefined,
          find: async () => undefined,
        },
        retryPolicy: {
          maxAttempts: 2,
          delay: async (): Promise<void> => {
            await new Promise<void>((resolve) => {
              setTimeout(resolve, 1);
            });
          },
        },
        httpClient: okClient(),
      }),
    ).not.toThrow();
    expect(() =>
      MessagingModule.register({
        isProduction: true,
        broker: durableBroker,
        deliveryStore: {
          save: async () => undefined,
          find: async () => undefined,
        },
        retryPolicy: {
          maxAttempts: 2,
          delay: async (): Promise<void> => {
            await new Promise<void>((resolve) => {
              void resolve;
            });
          },
        },
        httpClient: okClient(),
      }),
    ).not.toThrow();

    expect(new InMemoryMessageBroker({ maxRedeliveries: 1 })).toBeInstanceOf(
      InMemoryMessageBroker,
    );
    expect(new InMemoryMessageBroker({})).toBeInstanceOf(InMemoryMessageBroker);

    expect(() => new ExponentialBackoffRetryPolicy({ maxAttempts: 0 })).toThrow(
      RangeError,
    );
    expect(
      () => new ExponentialBackoffRetryPolicy({ baseDelayMs: -1 }),
    ).toThrow(RangeError);
    expect(
      () =>
        new ExponentialBackoffRetryPolicy({
          baseDelayMs: 10,
          maxDelayMs: 5,
        }),
    ).toThrow(RangeError);
    expect(() => new ExponentialBackoffRetryPolicy({ jitter: 2 })).toThrow(
      RangeError,
    );
    const policy = new ExponentialBackoffRetryPolicy({
      maxAttempts: 2,
      baseDelayMs: 1,
      jitter: 0,
      sleep: async () => undefined,
    });
    await expect(policy.delay(0)).rejects.toThrow(RangeError);
    await expect(policy.delay(1)).resolves.toBeUndefined();
    expect(() => new ExponentialBackoffRetryPolicy()).not.toThrow();

    const fullStore = new InMemoryWebhookDeliveryStore({ maxEntries: 1 });
    await fullStore.save({
      id: '1',
      url: 'https://example.test',
      payload: '{}',
      status: 'pending',
      attempts: 0,
    });
    await expect(
      fullStore.save({
        id: '2',
        url: 'https://example.test',
        payload: '{}',
        status: 'pending',
        attempts: 0,
      }),
    ).rejects.toThrow(/full/);
  });
});

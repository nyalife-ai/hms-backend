import { DynamicModule, Module } from '@nestjs/common';
import {
  allowInMemoryDefaults,
  type ProductionAwareOptions,
  resolveIsProduction,
} from '../architecture/production-defaults';
import { InMemoryMessageBroker } from './brokers/in-memory-broker';
import { MessageBroker } from './brokers/message-broker.interface';
import { EmailProvider } from './email/email-provider.interface';
import { EmailService } from './email/email.service';
import { PushProvider } from './push/push-provider.interface';
import { PushService } from './push/push.service';
import { SmsProvider } from './sms/sms-provider.interface';
import { SmsService } from './sms/sms.service';
import { ExponentialBackoffRetryPolicy } from './webhooks/exponential-backoff-retry.policy';
import { InMemoryWebhookDeliveryStore } from './webhooks/in-memory-delivery.store';
import { WebhookDeliveryService } from './webhooks/webhook-delivery.service';
import { WebhookSigner } from './webhooks/webhook-signer';
import { WebhookDeliveryStore } from './webhooks/webhook-store.interface';
import { HttpClient, RetryPolicy } from './webhooks/webhook.types';

export const MESSAGE_BROKER = Symbol('MESSAGE_BROKER');
export const WEBHOOK_DELIVERY_STORE = Symbol('WEBHOOK_DELIVERY_STORE');

export interface MessagingModuleOptions extends ProductionAwareOptions {
  readonly httpClient?: HttpClient;
  /**
   * Retry policy for webhook delivery. Production requires an explicit
   * non-noop policy (prefer {@link ExponentialBackoffRetryPolicy}).
   */
  readonly retryPolicy?: RetryPolicy;
  /**
   * Message broker. Required in production unless `allowInMemory`.
   * Never silently defaults to {@link InMemoryMessageBroker} in production.
   */
  readonly broker?: MessageBroker;
  /**
   * Durable webhook delivery store. Required in production when webhooks are
   * enabled unless `allowInMemory`.
   */
  readonly deliveryStore?: WebhookDeliveryStore;
  /**
   * When false, webhook delivery is disabled and an unavailable HTTP client
   * is acceptable. Defaults to true.
   */
  readonly enableWebhooks?: boolean;
  readonly emailProviders?: readonly EmailProvider[];
  readonly smsProviders?: readonly SmsProvider[];
  readonly pushProviders?: readonly PushProvider[];
}

const unavailableClient: HttpClient = {
  request: (): Promise<never> =>
    Promise.reject(new Error('No messaging HTTP client configured')),
};

@Module({})
export class MessagingModule {
  public static register(options: MessagingModuleOptions = {}): DynamicModule {
    const isProduction = resolveIsProduction(options);
    const allowInMemory = allowInMemoryDefaults(options);
    const enableWebhooks = options.enableWebhooks !== false;

    const broker =
      options.broker ??
      (allowInMemory ? new InMemoryMessageBroker() : undefined);
    if (!broker) {
      throw new Error(
        'MessagingModule: concrete broker is required in production (or set allowInMemory: true)',
      );
    }
    if (
      isProduction &&
      !options.allowInMemory &&
      broker instanceof InMemoryMessageBroker
    ) {
      throw new Error(
        'MessagingModule: InMemoryMessageBroker is not durable; provide a concrete broker (or set allowInMemory: true)',
      );
    }

    let store: WebhookDeliveryStore;
    if (enableWebhooks) {
      const resolved =
        options.deliveryStore ??
        (allowInMemory ? new InMemoryWebhookDeliveryStore() : undefined);
      if (!resolved) {
        throw new Error(
          'MessagingModule: durable deliveryStore is required in production when webhooks are enabled (or set allowInMemory: true)',
        );
      }
      if (
        isProduction &&
        !options.allowInMemory &&
        resolved instanceof InMemoryWebhookDeliveryStore
      ) {
        throw new Error(
          'MessagingModule: InMemoryWebhookDeliveryStore is not durable; provide a durable deliveryStore (or set allowInMemory: true)',
        );
      }
      store = resolved;
    } else {
      store =
        options.deliveryStore ??
        new InMemoryWebhookDeliveryStore({ maxEntries: 1 });
    }

    let retryPolicy: RetryPolicy;
    if (options.retryPolicy) {
      if (
        isProduction &&
        !options.allowInMemory &&
        enableWebhooks &&
        MessagingModule.isNoopRetry(options.retryPolicy)
      ) {
        throw new Error(
          'MessagingModule: retryPolicy must use exponential backoff with jitter in production (noop delay is not allowed)',
        );
      }
      retryPolicy = options.retryPolicy;
    } else if (enableWebhooks) {
      if (isProduction && !options.allowInMemory) {
        throw new Error(
          'MessagingModule: non-noop retryPolicy with exponential backoff is required in production (or set allowInMemory: true)',
        );
      }
      retryPolicy = new ExponentialBackoffRetryPolicy({
        maxAttempts: 3,
        baseDelayMs: 0,
        jitter: 0,
      });
    } else {
      retryPolicy = new ExponentialBackoffRetryPolicy({
        maxAttempts: 1,
        baseDelayMs: 0,
        jitter: 0,
      });
    }

    if (
      enableWebhooks &&
      isProduction &&
      !options.allowInMemory &&
      !options.httpClient
    ) {
      throw new Error(
        'MessagingModule: httpClient is required in production when webhooks are enabled (disable with enableWebhooks: false, or set allowInMemory: true)',
      );
    }

    const signer = new WebhookSigner();
    const emailService = new EmailService(options.emailProviders ?? []);
    const smsService = new SmsService(options.smsProviders ?? []);
    const pushService = new PushService(options.pushProviders ?? []);
    const webhookService = new WebhookDeliveryService(
      options.httpClient ?? unavailableClient,
      store,
      retryPolicy,
      signer,
    );
    return {
      module: MessagingModule,
      providers: [
        { provide: MESSAGE_BROKER, useValue: broker },
        { provide: WEBHOOK_DELIVERY_STORE, useValue: store },
        { provide: WebhookSigner, useValue: signer },
        { provide: WebhookDeliveryService, useValue: webhookService },
        { provide: EmailService, useValue: emailService },
        { provide: SmsService, useValue: smsService },
        { provide: PushService, useValue: pushService },
      ],
      exports: [
        MESSAGE_BROKER,
        WEBHOOK_DELIVERY_STORE,
        WebhookSigner,
        WebhookDeliveryService,
        EmailService,
        SmsService,
        PushService,
      ],
    };
  }

  private static isNoopRetry(policy: RetryPolicy): boolean {
    if (policy instanceof ExponentialBackoffRetryPolicy) {
      return false;
    }
    // Historical silent default: maxAttempts with an empty delay body.
    const source = policy.delay.toString();
    return (
      source.includes('Promise.resolve') &&
      !source.includes('setTimeout') &&
      !source.includes('sleep')
    );
  }
}

import type {
  EmailMessage,
  EmailProvider,
  SendResult,
} from '../../../platform/messaging/email/email-provider.interface';
import { RetryExecutor, RetryPolicy } from '../../../platform/reliability';
import type { StructuredLogger } from '../../../platform/observability';
import type { TimerPort } from '../http/http.types';

export interface SmtpTransportPort {
  sendMail(message: {
    readonly to: string;
    readonly from: string;
    readonly subject: string;
    readonly text?: string;
    readonly html?: string;
  }): Promise<{
    readonly messageId: string;
    readonly accepted?: readonly unknown[];
  }>;
}
export interface SmtpEmailProviderOptions {
  readonly timeoutMs?: number;
  readonly retryExecutor?: RetryExecutor;
  readonly retryPolicy?: RetryPolicy;
  readonly logger?: StructuredLogger;
  readonly timer?: TimerPort;
}

const nativeTimer: TimerPort = {
  set: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clear: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

export class SmtpEmailProvider implements EmailProvider {
  public readonly name = 'smtp';
  private readonly executor: RetryExecutor;
  private readonly policy: RetryPolicy;
  private readonly timer: TimerPort;

  public constructor(
    private readonly transport: SmtpTransportPort,
    private readonly options: SmtpEmailProviderOptions = {},
  ) {
    this.executor = options.retryExecutor ?? new RetryExecutor();
    this.policy =
      options.retryPolicy ?? new RetryPolicy({ maxAttempts: 3, delayMs: 100 });
    this.timer = options.timer ?? nativeTimer;
  }

  public send(message: EmailMessage): Promise<SendResult> {
    return this.executor.execute(async (attempt) => {
      this.options.logger?.info('SMTP send started', {
        attempt,
        recipientCount: message.to.length,
      });
      try {
        const result = await this.withTimeout(
          this.transport.sendMail({
            to: message.to.join(','),
            from: message.from,
            subject: message.subject,
            ...(message.text === undefined ? {} : { text: message.text }),
            ...(message.html === undefined ? {} : { html: message.html }),
          }),
        );
        return {
          provider: this.name,
          messageId: result.messageId,
          accepted: result.accepted === undefined || result.accepted.length > 0,
          attempts: attempt,
        };
      } catch {
        this.options.logger?.warn('SMTP send failed', { attempt });
        throw new Error('SMTP delivery failed');
      }
    }, this.policy);
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let handle: unknown;
    const timeout = new Promise<never>((_, reject) => {
      handle = this.timer.set(
        () => reject(new Error('SMTP delivery timed out')),
        this.options.timeoutMs ?? 10_000,
      );
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      this.timer.clear(handle);
    }
  }
}

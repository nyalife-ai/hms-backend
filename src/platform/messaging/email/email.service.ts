import {
  EmailMessage,
  EmailProvider,
  SendResult,
} from './email-provider.interface';
import { TemplateRenderer } from './template-renderer';

export class EmailService {
  private readonly providers: ReadonlyMap<string, EmailProvider>;

  public constructor(
    providers: readonly EmailProvider[],
    private readonly renderer: TemplateRenderer = new TemplateRenderer(),
    private readonly maxAttempts: number = 3,
  ) {
    this.providers = new Map(
      providers.map((provider) => [provider.name, provider]),
    );
  }

  public async send(
    providerName: string,
    message: EmailMessage,
  ): Promise<SendResult> {
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Unknown email provider: ${providerName}`);
    if (message.to.length === 0 || !message.from || !message.subject) {
      throw new Error('Invalid email message');
    }
    const rendered = message.template
      ? this.renderer.render(message.template, message.variables ?? {})
      : undefined;
    const outgoing: EmailMessage = {
      ...message,
      ...(rendered ? { html: rendered } : {}),
    };
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const result = await provider.send(outgoing);
        return { ...result, attempts: attempt };
      } catch (error: unknown) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Email delivery failed');
  }
}

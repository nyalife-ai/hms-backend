import {
  EmailMessage,
  EmailProvider,
  EmailTransport,
  SendResult,
} from './email-provider.interface';

export class SmtpEmailProvider implements EmailProvider {
  public readonly name = 'smtp';
  public constructor(private readonly transport: EmailTransport) {}
  public send(message: EmailMessage): Promise<SendResult> {
    return this.transport.send(this.name, message);
  }
}

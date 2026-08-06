import {
  EmailMessage,
  EmailProvider,
  EmailTransport,
  SendResult,
} from './email-provider.interface';

export class SendGridEmailProvider implements EmailProvider {
  public readonly name = 'sendgrid';
  public constructor(private readonly transport: EmailTransport) {}
  public send(message: EmailMessage): Promise<SendResult> {
    return this.transport.send(this.name, message);
  }
}

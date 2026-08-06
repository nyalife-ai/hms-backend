import {
  EmailMessage,
  EmailProvider,
  EmailTransport,
  SendResult,
} from './email-provider.interface';

export class SesEmailProvider implements EmailProvider {
  public readonly name = 'ses';
  public constructor(private readonly transport: EmailTransport) {}
  public send(message: EmailMessage): Promise<SendResult> {
    return this.transport.send(this.name, message);
  }
}

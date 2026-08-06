export interface EmailMessage {
  readonly to: readonly string[];
  readonly from: string;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly template?: string;
  readonly variables?: Readonly<Record<string, unknown>>;
}

export interface SendResult {
  readonly provider: string;
  readonly messageId: string;
  readonly accepted: boolean;
  readonly attempts?: number;
}

export interface EmailTransport {
  send(provider: string, message: EmailMessage): Promise<SendResult>;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<SendResult>;
}

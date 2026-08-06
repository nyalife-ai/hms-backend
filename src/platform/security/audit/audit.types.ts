export interface AuditActor {
  readonly id: string;
  readonly type: 'user' | 'service' | 'anonymous';
  readonly ip?: string;
}

export interface AuditEvent {
  readonly actor: AuditActor;
  readonly action: string;
  readonly resource: string;
  readonly timestamp: Date;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

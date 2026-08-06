import type { AuditEvent } from './audit.types';

export interface AuditSink {
  write(event: AuditEvent): Promise<void>;
}

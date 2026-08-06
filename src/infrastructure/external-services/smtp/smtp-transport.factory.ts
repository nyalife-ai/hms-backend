import type { ModuleResolver } from '../../optional-driver';
import { loadDriver } from '../../optional-driver';
import type { SmtpTransportPort } from './smtp-email.provider';

interface NodemailerModule {
  createTransport(
    options: Readonly<Record<string, unknown>>,
  ): SmtpTransportPort;
}

export function createSmtpTransport(
  options: Readonly<Record<string, unknown>>,
  resolver?: ModuleResolver,
): SmtpTransportPort {
  return loadDriver<NodemailerModule>('nodemailer', resolver).createTransport(
    options,
  );
}

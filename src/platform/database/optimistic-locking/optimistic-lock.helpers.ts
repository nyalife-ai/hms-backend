import { ConflictException } from '../../../core';

export type Versioned = Readonly<{ version: number }>;

export const assertVersion = (
  record: Versioned,
  expectedVersion: number,
): void => {
  if (record.version !== expectedVersion) {
    throw new ConflictException(
      `Version conflict: expected ${expectedVersion}, found ${record.version}`,
      'OPTIMISTIC_LOCK_CONFLICT',
      { expectedVersion, actualVersion: record.version },
    );
  }
};

export const bumpVersion = <T extends Versioned>(
  record: T,
): T & { version: number } => ({ ...record, version: record.version + 1 });

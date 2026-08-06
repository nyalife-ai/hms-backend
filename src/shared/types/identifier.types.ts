import type { Brand } from './utility.types';

export type Uuid = Brand<string, 'Uuid'>;
export type Ulid = Brand<string, 'Ulid'>;
export type EntityId<TName extends string> = Brand<string, `EntityId:${TName}`>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export const isUuid = (value: unknown): value is Uuid =>
  typeof value === 'string' && UUID_PATTERN.test(value);
export const createUuid = (value: string): Uuid => {
  if (!isUuid(value)) throw new TypeError('Invalid UUID v4');
  return value;
};
export const isUlid = (value: unknown): value is Ulid =>
  typeof value === 'string' && ULID_PATTERN.test(value);
export const createUlid = (value: string): Ulid => {
  if (!isUlid(value)) throw new TypeError('Invalid ULID');
  return value;
};
export const isEntityId = <TName extends string>(
  value: unknown,
): value is EntityId<TName> =>
  typeof value === 'string' && value.trim().length > 0;
export const createEntityId = <TName extends string>(
  value: string,
): EntityId<TName> => {
  if (!isEntityId<TName>(value))
    throw new TypeError('Invalid entity identifier');
  return value;
};

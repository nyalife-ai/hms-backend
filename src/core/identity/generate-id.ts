export type RandomUuidApi = {
  readonly randomUUID?: () => string;
  readonly getRandomValues?: (array: Uint8Array) => Uint8Array;
};

/**
 * Portable identifier generation for core constructs.
 * Accepts an optional crypto-like API so unit tests can exercise every branch.
 *
 * Always returns `prefix_<uuid>` using a CSPRNG. Never falls back to
 * `Math.random` or other predictable entropy.
 */
export function generateId(
  prefix: string,
  cryptoApi: RandomUuidApi | undefined = resolveCrypto(),
): string {
  return `${prefix}_${resolveUuid(cryptoApi)}`;
}

function resolveUuid(cryptoApi: RandomUuidApi | undefined): string {
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi?.getRandomValues === 'function') {
    return uuidFromGetRandomValues(cryptoApi.getRandomValues);
  }
  throw new Error(
    'No CSPRNG available for generateId (need crypto.randomUUID or crypto.getRandomValues)',
  );
}

function uuidFromGetRandomValues(
  getRandomValues: (array: Uint8Array) => Uint8Array,
): string {
  const bytes = new Uint8Array(16);
  getRandomValues(bytes);
  // RFC 4122 version 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function resolveCrypto(): RandomUuidApi | undefined {
  // globalThis is always defined in Node and modern browsers; keep the guard
  // for portable core runtimes (e.g. constrained embeds).
  /* istanbul ignore next */
  if (typeof globalThis === 'undefined') {
    return undefined;
  }
  return (globalThis as { crypto?: RandomUuidApi }).crypto;
}

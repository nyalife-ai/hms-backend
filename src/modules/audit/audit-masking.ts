/**
 * Mask sensitive fields in audit payloads (emails, phones, OTPs, tokens, hashes).
 */

const SENSITIVE_EXACT = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'currentpassword',
  'newpassword',
  'otp',
  'otpcode',
  'devotp',
  'token',
  'accesstoken',
  'refreshtoken',
  'resettoken',
  'authtoken',
  'authorization',
  'authorizationcode',
  'secret',
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
  'cardnumber',
  'card_number',
  'cvv',
  'pin',
]);

const SENSITIVE_PARTIAL = [
  'password',
  'otp',
  'token',
  'secret',
  'authorization',
  'api_key',
  'apikey',
  'private_key',
  'hash',
];

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const n = normalizeKey(key);
  if (SENSITIVE_EXACT.has(n)) return true;
  if (n.includes('email') || n.includes('phone') || n.includes('mobile')) {
    return true;
  }
  return SENSITIVE_PARTIAL.some((p) => n.includes(p));
}

function maskScalar(key: string, value: string): string {
  const n = normalizeKey(key);
  if (
    n.includes('password') ||
    n.includes('otp') ||
    n.includes('token') ||
    n.includes('secret') ||
    n.includes('hash') ||
    n.includes('authorization') ||
    n.includes('cvv') ||
    n.includes('pin')
  ) {
    return '***';
  }
  if (n.includes('email')) {
    const at = value.indexOf('@');
    if (at > 1) {
      return `${value[0]}***${value.slice(at)}`;
    }
    return '***';
  }
  if (n.includes('phone') || n.includes('mobile')) {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 4) return '***';
    return `***${digits.slice(-2)}`;
  }
  if (value.length <= 4) return '***';
  return `***${value.slice(-2)}`;
}

export function maskAuditValue(value: unknown, key = ''): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    return isSensitiveKey(key) ? maskScalar(key, value) : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return isSensitiveKey(key) ? '***' : value;
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => maskAuditValue(v, `${key}[${i}]`));
  }
  if (typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = maskAuditValue(v, k);
    }
    return out;
  }
  return String(value);
}

export function maskAuditRecord(
  record: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!record) return null;
  return maskAuditValue(record) as Record<string, unknown>;
}

/** Field-level diff: keys that changed between old and new. */
export function diffAuditFields(
  oldValues: Record<string, unknown> | null | undefined,
  newValues: Record<string, unknown> | null | undefined,
): Array<{ field: string; from: unknown; to: unknown }> {
  const oldObj = oldValues ?? {};
  const newObj = newValues ?? {};
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  for (const key of keys) {
    const from = oldObj[key];
    const to = newObj[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({
        field: key,
        from: maskAuditValue(from, key),
        to: maskAuditValue(to, key),
      });
    }
  }
  return changes;
}

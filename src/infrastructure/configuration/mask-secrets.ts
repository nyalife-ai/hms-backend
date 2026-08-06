const SECRET_KEY =
  /(password|passwd|pwd|secret|token|api[-_]?key|authorization|credential)/i;

const MASK = '[REDACTED]';

export function maskConnectionUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.password.length > 0) {
      url.password = MASK;
    }
    return url.toString();
  } catch {
    return value.replace(
      /((?:password|passwd|pwd|secret|token|api[-_]?key)\s*[=:]\s*)([^&\s,;]+)/gi,
      `$1${MASK}`,
    );
  }
}

export function maskError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return maskConnectionUrl(message);
}

export function maskSecrets<T>(value: T): T {
  return maskValue(value, new WeakSet<object>()) as T;
}

function maskValue(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    return value.map((item) => maskValue(item, seen));
  }
  if (typeof value !== 'object' || value === null) {
    return typeof value === 'string' ? maskConnectionUrl(value) : value;
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);
  const masked: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    masked[key] = SECRET_KEY.test(key) ? MASK : maskValue(item, seen);
  }
  return masked;
}

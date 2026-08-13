/**
 * Daraja / Safaricom M-Pesa callback IP allowlist.
 * Defaults are documented Safaricom ranges; extend via MPESA_CALLBACK_ALLOWED_IPS
 * (comma-separated IPs or CIDR-ish prefixes). Empty env keeps defaults.
 * IP allowlisting is an additional control — never the sole auth check.
 */

export const DEFAULT_DARAJA_CALLBACK_IPS: readonly string[] = [
  // Safaricom / Daraja published ranges (sandbox + production; keep extendable)
  '196.201.214.',
  '196.201.215.',
  '196.201.216.',
  '196.201.217.',
  '196.201.218.',
  '196.201.219.',
  '127.0.0.1',
  '::1',
];

export function resolveMpesaCallbackAllowlist(
  envValue?: string | null,
): string[] {
  const fromEnv = (envValue || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv.includes('*') || fromEnv.includes('ANY')) {
    return ['*'];
  }
  if (fromEnv.length) {
    return [...new Set([...DEFAULT_DARAJA_CALLBACK_IPS, ...fromEnv])];
  }
  return [...DEFAULT_DARAJA_CALLBACK_IPS];
}

export function isMpesaCallbackIpAllowed(
  remoteIp: string | undefined,
  allowlist: string[],
): boolean {
  if (allowlist.includes('*')) return true;
  if (!remoteIp?.trim()) return false;
  const ip = remoteIp.trim().replace(/^::ffff:/, '');
  return allowlist.some((entry) => {
    if (entry.endsWith('.')) return ip.startsWith(entry);
    return ip === entry;
  });
}

/**
 * Ensure Prisma's client-side pool settings play nicely with Supabase / PgBouncer.
 *
 * Live symptom we guard against:
 *   FATAL: (EMAXCONNSESSION) max clients reached in session mode — pool_size: 15
 *
 * Nest on Render holds connections for the process lifetime. If each dyno opens
 * Prisma's default (~num_cpus×2+1) or a high `connection_limit`, a few instances
 * exhaust the Supabase session pool and random queries (e.g. billing overview
 * `insuranceClaims.count`) start failing.
 *
 * Rules:
 * - Transaction pooler (6543 / pgbouncer=true): connection_limit=1
 * - Session pooler (*.pooler.supabase.com:5432): cap at 3 (never raise above)
 * - Direct / local: default 5 if unset
 */

export function datasourceUrlWithPool(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const isSupabasePooler = host.includes('pooler.supabase.com');
    const isTransactionPooler =
      url.searchParams.get('pgbouncer') === 'true' ||
      url.port === '6543' ||
      /:6543(\/|\?|$)/.test(raw);

    const isSessionPooler = isSupabasePooler && !isTransactionPooler;

    if (isTransactionPooler) {
      url.searchParams.set('pgbouncer', 'true');
      url.searchParams.set('connection_limit', '1');
      if (!url.searchParams.has('pool_timeout')) {
        url.searchParams.set('pool_timeout', '20');
      }
    } else if (isSessionPooler) {
      const requested = Number.parseInt(
        url.searchParams.get('connection_limit') ?? '3',
        10,
      );
      const capped = Math.min(
        Math.max(Number.isFinite(requested) && requested > 0 ? requested : 3, 1),
        3,
      );
      url.searchParams.set('connection_limit', String(capped));
      if (!url.searchParams.has('pool_timeout')) {
        url.searchParams.set('pool_timeout', '30');
      }
    } else if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '5');
      if (!url.searchParams.has('pool_timeout')) {
        url.searchParams.set('pool_timeout', '30');
      }
    }

    if (!url.searchParams.has('connect_timeout')) {
      url.searchParams.set('connect_timeout', '15');
    }
    return url.toString();
  } catch {
    return raw;
  }
}

export function isDbPoolExhaustedError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error ?? '');
  return (
    /EMAXCONNSESSION/i.test(msg) ||
    /max clients reached/i.test(msg) ||
    /remaining connection slots are reserved/i.test(msg) ||
    /too many connections/i.test(msg) ||
    /Can't reach database server/i.test(msg)
  );
}

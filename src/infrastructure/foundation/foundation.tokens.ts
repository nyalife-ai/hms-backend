/** Resolved {@link FoundationModuleOptions} bound into DI. */
export const FOUNDATION_OPTIONS = Symbol('FOUNDATION_OPTIONS');

/** Composed readiness/liveness health aggregator. */
export const FOUNDATION_HEALTH = Symbol('FOUNDATION_HEALTH');

/**
 * Documented Nest HTTP pipeline stage order for FoundationModule.
 *
 * Stages are registered as APP_* providers only when explicitly enabled in
 * {@link FoundationPipelineOptions}. Silent global auth/public defaults are
 * intentionally avoided.
 *
 * Order:
 * 1. request/correlation context
 * 2. validation (APP_PIPE)
 * 3. auth (APP_GUARD)
 * 4. tenant (APP_INTERCEPTOR / guard)
 * 5. rate limit (APP_GUARD)
 * 6. audit (APP_INTERCEPTOR)
 * 7. response/tracing + active-request drain tracking
 */
export const FOUNDATION_PIPELINE_ORDER = [
  'correlation',
  'validation',
  'auth',
  'tenant',
  'rateLimit',
  'audit',
  'tracing',
] as const;

export type FoundationPipelineStage =
  (typeof FOUNDATION_PIPELINE_ORDER)[number];

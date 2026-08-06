/**
 * Clock port — inject time instead of calling `Date.now()` / `new Date()`
 * so domain logic and tests remain deterministic.
 *
 * Core only defines this port. Concrete implementations (e.g. `SystemClock`)
 * live in **platform**; tests should provide a fake Clock. Domain/core code
 * must not instantiate wall-clock sources directly when determinism matters.
 */
export interface Clock {
  now(): Date;
  /**
   * Milliseconds since Unix epoch.
   */
  timestamp(): number;
}

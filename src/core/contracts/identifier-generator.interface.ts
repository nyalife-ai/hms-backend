/**
 * Identifier generator port.
 *
 * Core only defines this port. Platform may implement UUID, ULID, Snowflake,
 * or database sequences. Prefer injecting an `IdentifierGenerator` from
 * platform (or a test double) over calling ad-hoc RNG helpers when identity
 * must be swappable or deterministic in tests.
 *
 * For lightweight core event/command ids, `generateId` is available and
 * always uses a CSPRNG; still prefer this port for application-level identity.
 */
export interface IdentifierGenerator<TId = string> {
  next(): TId;
}

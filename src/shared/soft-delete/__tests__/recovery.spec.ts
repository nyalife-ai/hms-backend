import {
  isRestorable,
  isSoftDeleted,
  partitionByRecoverability,
  restore,
  restoreWithinWindow,
  softDelete,
} from '../recovery';

describe('soft-delete recovery', () => {
  it('marks records deleted and restored', () => {
    const deletedAt = new Date('2024-01-01T00:00:00Z');
    const deleted = softDelete({ id: '1' }, deletedAt);
    expect(isSoftDeleted(deleted)).toBe(true);
    expect(deleted.deletedAt).toBe(deletedAt);
    const restored = restore(deleted);
    expect(isSoftDeleted(restored)).toBe(false);
    expect(restored.deletedAt).toBeNull();
  });

  it('defaults deletedAt to now', () => {
    const before = Date.now();
    expect(softDelete({ id: '1' }).deletedAt.getTime()).toBeGreaterThanOrEqual(
      before,
    );
  });

  it('treats undefined and null deletedAt as active', () => {
    expect(isSoftDeleted({})).toBe(false);
    expect(isSoftDeleted({ deletedAt: null })).toBe(false);
  });

  it('checks restorability against a recovery window, accepting date/string/number', () => {
    const now = new Date('2024-02-01T00:00:00Z');
    const policy = { maxRecoverableAgeMs: 24 * 60 * 60 * 1000 };
    expect(
      isRestorable(
        { deletedAt: new Date('2024-01-31T23:00:00Z') },
        policy,
        now,
      ),
    ).toBe(true);
    expect(
      isRestorable({ deletedAt: '2024-01-01T00:00:00Z' }, policy, now),
    ).toBe(false);
    expect(isRestorable({ deletedAt: now.getTime() }, policy, now)).toBe(true);
    expect(isRestorable({}, policy, now)).toBe(false);
  });

  it('defaults now to the current time when omitted', () => {
    const policy = { maxRecoverableAgeMs: 24 * 60 * 60 * 1000 };
    expect(isRestorable({ deletedAt: new Date(Date.now() - 1) }, policy)).toBe(
      true,
    );
    const recent = { id: '1', deletedAt: new Date(Date.now() - 1) };
    expect(restoreWithinWindow(recent, policy).deletedAt).toBeNull();
    const result = partitionByRecoverability([recent], policy);
    expect(result.recoverable).toEqual([recent]);
  });

  it('restores within the window and rejects outside it or when not deleted', () => {
    const now = new Date('2024-02-01T00:00:00Z');
    const policy = { maxRecoverableAgeMs: 24 * 60 * 60 * 1000 };
    const recent = { id: '1', deletedAt: new Date('2024-01-31T23:00:00Z') };
    expect(restoreWithinWindow(recent, policy, now).deletedAt).toBeNull();

    const expired = { id: '2', deletedAt: new Date('2024-01-01T00:00:00Z') };
    expect(() => restoreWithinWindow(expired, policy, now)).toThrow(
      'outside its recovery window',
    );

    expect(() => restoreWithinWindow({ id: '3' }, policy, now)).toThrow(
      'not soft-deleted',
    );
  });

  it('partitions records by recoverability, skipping active records', () => {
    const now = new Date('2024-02-01T00:00:00Z');
    const policy = { maxRecoverableAgeMs: 24 * 60 * 60 * 1000 };
    const active = { id: '1' };
    const recoverable = {
      id: '2',
      deletedAt: new Date('2024-01-31T23:00:00Z'),
    };
    const expiredRecord = {
      id: '3',
      deletedAt: new Date('2024-01-01T00:00:00Z'),
    };
    const result = partitionByRecoverability(
      [active, recoverable, expiredRecord],
      policy,
      now,
    );
    expect(result.recoverable).toEqual([recoverable]);
    expect(result.expired).toEqual([expiredRecord]);
  });
});

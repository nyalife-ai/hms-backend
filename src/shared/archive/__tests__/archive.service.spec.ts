import {
  ArchiveService,
  filterActive,
  filterArchived,
  isArchived,
  isEligibleForPurge,
  markArchived,
  markRestored,
} from '../archive.service';

describe('archive helpers', () => {
  it('marks records archived and restored', () => {
    const record = { id: '1' };
    const archivedAt = new Date('2024-01-01T00:00:00Z');
    const archived = markArchived(record, archivedAt);
    expect(isArchived(archived)).toBe(true);
    expect(archived.archivedAt).toBe(archivedAt);
    const restored = markRestored(archived);
    expect(isArchived(restored)).toBe(false);
    expect(restored.archivedAt).toBeNull();
  });

  it('defaults archivedAt to now when not provided', () => {
    const before = Date.now();
    const archived = markArchived({ id: '1' });
    expect(archived.archivedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('filters active and archived records', () => {
    const active = { id: '1', archivedAt: null };
    const archived = { id: '2', archivedAt: new Date() };
    expect(filterActive([active, archived])).toEqual([active]);
    expect(filterArchived([active, archived])).toEqual([archived]);
  });

  it('treats undefined archivedAt as active', () => {
    expect(isArchived({})).toBe(false);
  });

  it('determines purge eligibility based on retention policy', () => {
    const now = new Date('2024-02-01T00:00:00Z');
    const archivedLongAgo = {
      id: '1',
      archivedAt: new Date('2024-01-01T00:00:00Z'),
    };
    const archivedRecently = {
      id: '2',
      archivedAt: new Date('2024-01-31T23:00:00Z'),
    };
    const active = { id: '3', archivedAt: null };
    const policy = { maxAgeMs: 24 * 60 * 60 * 1000 };
    expect(isEligibleForPurge(archivedLongAgo, policy, now)).toBe(true);
    expect(isEligibleForPurge(archivedRecently, policy, now)).toBe(false);
    expect(isEligibleForPurge(active, policy, now)).toBe(false);
  });

  it('defaults now to the current time when omitted', () => {
    const archived = { id: '1', archivedAt: new Date(Date.now() - 1) };
    expect(isEligibleForPurge(archived, { maxAgeMs: 0 })).toBe(true);
  });
});

describe('ArchiveService', () => {
  it('adds, retrieves, archives and restores records', () => {
    const service = new ArchiveService<{
      id: string;
      archivedAt?: Date | null;
    }>([{ id: '1' }]);
    service.add({ id: '2' });
    expect(service.get('2')).toEqual({ id: '2' });
    expect(service.get('missing')).toBeUndefined();

    const archived = service.archive('1');
    expect(isArchived(archived)).toBe(true);
    expect(service.listActive()).toEqual([{ id: '2' }]);
    expect(service.listArchived()).toEqual([archived]);

    const restored = service.restore('1');
    expect(isArchived(restored)).toBe(false);
    expect(service.listActive()).toHaveLength(2);
  });

  it('throws when archiving or restoring an unknown id', () => {
    const service = new ArchiveService();
    expect(() => service.archive('missing')).toThrow(
      'no record with id "missing"',
    );
    expect(() => service.restore('missing')).toThrow(
      'no record with id "missing"',
    );
  });

  it('purges records eligible under a retention policy', () => {
    const now = new Date('2024-02-01T00:00:00Z');
    const service = new ArchiveService<{
      id: string;
      archivedAt?: Date | null;
    }>([
      { id: '1', archivedAt: new Date('2024-01-01T00:00:00Z') },
      { id: '2', archivedAt: new Date('2024-01-31T23:00:00Z') },
      { id: '3' },
    ]);
    const purged = service.purgeEligible(
      { maxAgeMs: 24 * 60 * 60 * 1000 },
      now,
    );
    expect(purged.map((item) => item.id)).toEqual(['1']);
    expect(service.get('1')).toBeUndefined();
    expect(service.get('2')).toBeDefined();
  });

  it('defaults purgeEligible now to the current time when omitted', () => {
    const service = new ArchiveService<{
      id: string;
      archivedAt?: Date | null;
    }>([{ id: '1', archivedAt: new Date(Date.now() - 1) }]);
    expect(
      service.purgeEligible({ maxAgeMs: 0 }).map((item) => item.id),
    ).toEqual(['1']);
  });
});

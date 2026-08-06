import { InMemoryBackupProvider } from '../in-memory-backup.provider';

describe('InMemoryBackupProvider', () => {
  it('creates, lists, fetches, restores and removes backups', async () => {
    const provider = new InMemoryBackupProvider({
      clock: () => new Date('2024-01-01T00:00:00Z'),
    });
    const descriptor = await provider.create({
      label: 'nightly',
      data: Buffer.from('payload'),
    });
    expect(descriptor).toMatchObject({
      label: 'nightly',
      status: 'completed',
      sizeBytes: 7,
    });
    expect(await provider.list()).toEqual([descriptor]);
    expect(await provider.get(descriptor.id)).toEqual(descriptor);
    expect(await provider.get('missing')).toBeUndefined();

    const restored = await provider.restore(descriptor.id);
    expect(restored.data).toEqual(Buffer.from('payload'));

    expect(await provider.remove(descriptor.id)).toBe(true);
    expect(await provider.remove(descriptor.id)).toBe(false);
    expect(await provider.list()).toEqual([]);
  });

  it('rejects restoring an unknown backup', async () => {
    const provider = new InMemoryBackupProvider();
    await expect(provider.restore('missing')).rejects.toThrow(
      'No backup found',
    );
  });

  it('generates sequential ids and clears state', async () => {
    const provider = new InMemoryBackupProvider();
    const first = await provider.create({ label: 'a', data: Buffer.from('x') });
    const second = await provider.create({
      label: 'b',
      data: Buffer.from('y'),
    });
    expect(first.id).not.toBe(second.id);
    provider.clear();
    expect(await provider.list()).toEqual([]);
  });
});

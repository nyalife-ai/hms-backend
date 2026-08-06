import { NotFoundException } from '../../../core/exceptions/not-found.exception';
import { ValidationException } from '../../../core/exceptions/validation.exception';
import { buildCdnUrl } from '../cdn-url.helper';
import {
  isExtendedStorageProvider,
  supportsPutStream,
} from '../extended-storage-provider.interface';
import { InMemoryResumableUploadRegistry } from '../in-memory-resumable-upload.registry';
import { InMemoryStorage } from '../in-memory.storage';
import { StorageOperations } from '../storage-operations';
import {
  assertAllowedContentType,
  assertChecksumMatches,
  assertSafeKey,
  assertWithinSizeLimit,
  computeChecksum,
  sanitizeFilename,
  verifyChecksum,
} from '../storage-security';
import { StorageService } from '../storage.service';
import { STORAGE_OPTIONS, STORAGE_PROVIDER } from '../storage.tokens';
import type { StorageProvider } from '../storage-provider.interface';

describe('storage security', () => {
  it('exposes distinct dependency injection tokens', () => {
    expect(STORAGE_PROVIDER).not.toBe(STORAGE_OPTIONS);
  });

  it('sanitizes traversal, separators, controls and empty names', () => {
    expect(sanitizeFilename('../private\\\u0000/file.txt')).toBe(
      'private-file.txt',
    );
    expect(sanitizeFilename('./../\u0000')).toBe('unnamed');
    expect(sanitizeFilename('  avatar.png  ')).toBe('avatar.png');
  });

  it('accepts exact and wildcard content types', () => {
    expect(() =>
      assertAllowedContentType('application/json', ['application/json']),
    ).not.toThrow();
    expect(() =>
      assertAllowedContentType('image/png', ['image/*']),
    ).not.toThrow();
    expect(() =>
      assertAllowedContentType(undefined, ['image/*']),
    ).not.toThrow();
    expect(() => assertAllowedContentType('text/plain', [])).not.toThrow();
  });

  it('rejects disallowed content types', () => {
    expect(() =>
      assertAllowedContentType('application/x-msdownload', ['image/*']),
    ).toThrow(ValidationException);
  });

  it('enforces valid sizes and limits', () => {
    expect(() => assertWithinSizeLimit(4, 4)).not.toThrow();
    for (const [size, maximum] of [
      [5, 4],
      [-1, 4],
      [1.5, 4],
      [1, -1],
    ]) {
      expect(() => assertWithinSizeLimit(size, maximum)).toThrow(
        ValidationException,
      );
    }
  });

  it('accepts safe nested keys and rejects unsafe keys', () => {
    expect(() => assertSafeKey('users/1/avatar.png')).not.toThrow();
    for (const key of [
      '',
      '/absolute',
      '../secret',
      'folder/../secret',
      'folder/./file',
      'folder//file',
      'folder\\file',
      'bad\u0000key',
    ]) {
      expect(() => assertSafeKey(key)).toThrow(ValidationException);
    }
  });
});

describe('storage checksum helpers', () => {
  it('computes and verifies matching checksums, including prefixed values', () => {
    const body = Buffer.from('payload');
    const checksum = computeChecksum(body);
    expect(verifyChecksum(body, checksum)).toBe(true);
    expect(verifyChecksum(body, `sha256:${checksum}`)).toBe(true);
  });

  it('rejects mismatched, malformed or empty checksums', () => {
    const body = Buffer.from('payload');
    expect(verifyChecksum(body, computeChecksum(Buffer.from('other')))).toBe(
      false,
    );
    expect(verifyChecksum(body, '')).toBe(false);
    expect(verifyChecksum(body, 'not-hex-and-wrong-length')).toBe(false);
  });

  it('asserts checksum matches or throws ValidationException', () => {
    const body = Buffer.from('payload');
    expect(() => assertChecksumMatches(body, undefined)).not.toThrow();
    expect(() =>
      assertChecksumMatches(body, computeChecksum(body)),
    ).not.toThrow();
    expect(() => assertChecksumMatches(body, 'deadbeef')).toThrow(
      ValidationException,
    );
  });
});

describe('buildCdnUrl', () => {
  it('builds encoded URLs with and without query params', () => {
    expect(
      buildCdnUrl('users/1/avatar.png', { baseUrl: 'https://cdn.test/' }),
    ).toBe('https://cdn.test/users/1/avatar.png');
    expect(
      buildCdnUrl('a b/c.png', {
        baseUrl: 'https://cdn.test',
        queryParams: { v: '2' },
      }),
    ).toBe('https://cdn.test/a%20b/c.png?v=2');
  });

  it('rejects unsafe keys and empty base URLs', () => {
    expect(() =>
      buildCdnUrl('../secret', { baseUrl: 'https://cdn.test' }),
    ).toThrow(ValidationException);
    expect(() => buildCdnUrl('key', { baseUrl: '  ' })).toThrow(RangeError);
  });
});

describe('StorageOperations', () => {
  function memoryProvider(): StorageProvider {
    return new InMemoryStorage();
  }

  it('copies and moves objects using get+put+delete', async () => {
    const provider = memoryProvider();
    await provider.put('a', Buffer.from('x'), { contentType: 'text/plain' });
    const operations = new StorageOperations(provider);
    const copied = await operations.copy('a', 'b');
    expect(copied.contentType).toBe('text/plain');
    expect(await provider.exists('a')).toBe(true);
    expect(await provider.exists('b')).toBe(true);

    const moved = await operations.move('b', 'c');
    expect(moved.key).toBe('c');
    expect(await provider.exists('b')).toBe(false);
    expect(await provider.exists('c')).toBe(true);
  });
});

describe('extended storage provider detection', () => {
  it('detects providers implementing copy/move and putStream', () => {
    const storage = new InMemoryStorage();
    expect(isExtendedStorageProvider(storage)).toBe(true);
    expect(supportsPutStream(storage)).toBe(false);
    const bare: StorageProvider = {
      name: 'bare',
      put: jest.fn(),
      get: jest.fn(),
      getStream: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      stat: jest.fn(),
      signedUrl: jest.fn(),
    };
    expect(isExtendedStorageProvider(bare)).toBe(false);
    const withStream = {
      ...bare,
      copy: jest.fn(),
      move: jest.fn(),
      putStream: jest.fn(),
    };
    expect(supportsPutStream(withStream)).toBe(true);
  });
});

describe('InMemoryStorage', () => {
  it('stores, streams, signs, copies, moves and clears objects', async () => {
    const storage = new InMemoryStorage({
      maxBytes: 10,
      allowedContentTypes: ['text/*'],
      clock: () => new Date(1_000),
    });
    const metadata = await storage.put('a/one.txt', Buffer.from('one'), {
      contentType: 'text/plain',
    });
    expect(metadata).toMatchObject({ size: 3, contentType: 'text/plain' });
    expect(await storage.get('a/one.txt')).toEqual(Buffer.from('one'));
    const stream = await storage.getStream('a/one.txt');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('one');
    expect(await storage.exists('a/one.txt')).toBe(true);
    expect((await storage.stat('a/one.txt')).size).toBe(3);
    const url = await storage.signedUrl('a/one.txt', { expiresInSeconds: 60 });
    expect(url).toContain('memory://');

    const copied = await storage.copy('a/one.txt', 'a/two.txt');
    expect(copied.contentType).toBe('text/plain');
    const moved = await storage.move('a/two.txt', 'a/three.txt');
    expect(moved.key).toBe('a/three.txt');
    expect(await storage.exists('a/two.txt')).toBe(false);

    expect(await storage.delete('a/one.txt')).toBe(true);
    expect(await storage.delete('a/one.txt')).toBe(false);

    storage.clear();
    expect(await storage.exists('a/three.txt')).toBe(false);
  });

  it('rejects unsafe keys, oversized bodies and disallowed content types', async () => {
    const storage = new InMemoryStorage({
      maxBytes: 2,
      allowedContentTypes: ['image/*'],
    });
    await expect(storage.put('x', Buffer.from('xxx'))).rejects.toThrow(
      ValidationException,
    );
    await expect(
      storage.put('x', Buffer.from('x'), { contentType: 'text/plain' }),
    ).rejects.toThrow(ValidationException);
    await expect(
      storage.signedUrl('x', { expiresInSeconds: 0 }),
    ).rejects.toThrow(RangeError);
  });

  it('throws NotFoundException for missing objects', async () => {
    const storage = new InMemoryStorage();
    await expect(storage.get('missing')).rejects.toThrow(NotFoundException);
    await expect(storage.stat('missing')).rejects.toThrow(NotFoundException);
    await expect(storage.copy('missing', 'x')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('omits contentType from metadata and copies when absent', async () => {
    const storage = new InMemoryStorage();
    const metadata = await storage.put('no-type', Buffer.from('x'));
    expect(metadata.contentType).toBeUndefined();
    const copied = await storage.copy('no-type', 'no-type-2');
    expect(copied.contentType).toBeUndefined();
  });
});

describe('InMemoryResumableUploadRegistry', () => {
  it('runs the full chunked upload lifecycle', async () => {
    const provider = new InMemoryStorage();
    const registry = new InMemoryResumableUploadRegistry(provider, {
      maxBytes: 100,
    });
    const session = await registry.start('big-file.bin', 6);
    expect(session.completed).toBe(false);
    const afterFirst = await registry.appendChunk(
      session.id,
      Buffer.from('abc'),
    );
    expect(afterFirst.receivedBytes).toBe(3);
    const afterSecond = await registry.appendChunk(
      session.id,
      Buffer.from('def'),
    );
    expect(afterSecond.receivedBytes).toBe(6);
    const metadata = await registry.complete(session.id);
    expect(metadata.size).toBe(6);
    expect(await provider.get('big-file.bin')).toEqual(Buffer.from('abcdef'));
    const completedSession = await registry.getSession(session.id);
    expect(completedSession?.completed).toBe(true);
  });

  it('rejects operations on missing, exceeded or already-completed sessions', async () => {
    const provider = new InMemoryStorage();
    const registry = new InMemoryResumableUploadRegistry(provider, {
      maxBytes: 4,
    });
    await expect(
      registry.appendChunk('missing', Buffer.from('x')),
    ).rejects.toThrow(NotFoundException);
    await expect(registry.complete('missing')).rejects.toThrow(
      NotFoundException,
    );
    await expect(registry.abort('missing')).rejects.toThrow(NotFoundException);
    expect(await registry.getSession('missing')).toBeUndefined();

    const withTotal = await registry.start('small.bin', 2);
    await expect(
      registry.appendChunk(withTotal.id, Buffer.from('abc')),
    ).rejects.toThrow(RangeError);

    const withoutOverflow = await registry.start('capped.bin');
    await expect(
      registry.appendChunk(withoutOverflow.id, Buffer.from('abcde')),
    ).rejects.toThrow(ValidationException);

    const completable = await registry.start('done.bin');
    await registry.appendChunk(completable.id, Buffer.from('ok'));
    await registry.complete(completable.id);
    await expect(registry.complete(completable.id)).rejects.toThrow(
      /already completed/,
    );
    await expect(
      registry.appendChunk(completable.id, Buffer.from('x')),
    ).rejects.toThrow(/already completed/);

    const aborted = await registry.start('aborted.bin');
    await registry.abort(aborted.id);
    expect(await registry.getSession(aborted.id)).toBeUndefined();
  });

  it('defaults maxBytes when no options are supplied', async () => {
    const provider = new InMemoryStorage();
    const registry = new InMemoryResumableUploadRegistry(provider);
    const session = await registry.start('unbounded.bin');
    await registry.appendChunk(session.id, Buffer.from('x'.repeat(1000)));
    const metadata = await registry.complete(session.id);
    expect(metadata.size).toBe(1000);
  });
});

describe('StorageService', () => {
  it('validates, uploads, downloads and inspects objects', async () => {
    const provider = new InMemoryStorage();
    const service = new StorageService(provider, {
      maxBytes: 100,
      allowedContentTypes: ['text/*'],
    });
    const body = Buffer.from('hello');
    const metadata = await service.upload('a.txt', body, {
      contentType: 'text/plain',
      expectedChecksum: computeChecksum(body),
    });
    expect(metadata.contentType).toBe('text/plain');
    expect(await service.download('a.txt')).toEqual(body);
    expect((await service.getMetadata('a.txt')).size).toBe(5);
    expect(await service.exists('a.txt')).toBe(true);
    expect(await service.signedUrl('a.txt', { expiresInSeconds: 1 })).toContain(
      'memory://',
    );
    expect(await service.remove('a.txt')).toBe(true);
  });

  it('forwards custom metadata to the underlying provider', async () => {
    const provider = new InMemoryStorage();
    const putSpy = jest.spyOn(provider, 'put');
    const service = new StorageService(provider);
    await service.upload('meta.txt', Buffer.from('x'), {
      metadata: { owner: 'team-a' },
    });
    expect(putSpy).toHaveBeenCalledWith(
      'meta.txt',
      expect.any(Buffer),
      expect.objectContaining({ metadata: { owner: 'team-a' } }),
    );
  });

  it('rolls back uploads that fail checksum verification', async () => {
    const provider = new InMemoryStorage();
    const service = new StorageService(provider);
    await expect(
      service.upload('bad.txt', Buffer.from('hello'), {
        expectedChecksum: 'deadbeef',
      }),
    ).rejects.toThrow(ValidationException);
    expect(await provider.exists('bad.txt')).toBe(false);
  });

  it('swallows rollback delete failures after a checksum mismatch', async () => {
    const provider = new InMemoryStorage();
    jest.spyOn(provider, 'delete').mockRejectedValueOnce(new Error('boom'));
    const service = new StorageService(provider);
    await expect(
      service.upload('bad.txt', Buffer.from('hello'), {
        expectedChecksum: 'deadbeef',
      }),
    ).rejects.toThrow(ValidationException);
  });

  it('enforces size and content-type policy before uploading', async () => {
    const provider = new InMemoryStorage();
    const service = new StorageService(provider, {
      maxBytes: 2,
      allowedContentTypes: ['image/*'],
    });
    await expect(service.upload('x.txt', Buffer.from('xxx'))).rejects.toThrow(
      ValidationException,
    );
    await expect(
      service.upload('x.txt', Buffer.from('x'), { contentType: 'text/plain' }),
    ).rejects.toThrow(ValidationException);
  });

  it('delegates copy/move to native support when available, else falls back', async () => {
    const extended = new InMemoryStorage();
    await extended.put('a', Buffer.from('x'));
    const extendedService = new StorageService(extended);
    const copied = await extendedService.copy('a', 'b');
    expect(copied.key).toBe('b');
    const moved = await extendedService.move('b', 'c');
    expect(moved.key).toBe('c');

    const bare: StorageProvider = {
      name: 'bare',
      put: jest.fn().mockResolvedValue({ key: 'to', size: 1 }),
      get: jest.fn().mockResolvedValue(Buffer.from('x')),
      getStream: jest.fn(),
      delete: jest.fn().mockResolvedValue(true),
      exists: jest.fn(),
      stat: jest.fn().mockResolvedValue({ key: 'from', size: 1 }),
      signedUrl: jest.fn(),
    };
    const bareService = new StorageService(bare);
    const bareCopy = await bareService.copy('from', 'to');
    expect(bareCopy).toMatchObject({ key: 'to' });
    await bareService.move('from', 'to');
    expect(bare.delete).toHaveBeenCalledWith('from');
  });

  it('builds CDN URLs through the facade', () => {
    const service = new StorageService(new InMemoryStorage());
    expect(service.cdnUrl('a.txt', { baseUrl: 'https://cdn.test' })).toBe(
      'https://cdn.test/a.txt',
    );
  });
});

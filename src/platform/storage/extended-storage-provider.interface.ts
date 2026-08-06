import type { Readable } from 'node:stream';
import type {
  StorageObjectMetadata,
  StoragePutOptions,
  StorageProvider,
} from './storage-provider.interface';

/**
 * Optional capability surface layered on top of {@link StorageProvider}.
 *
 * Providers are not required to implement this — infrastructure adapters
 * that cannot support a capability natively can be wrapped with
 * {@link StorageOperations} to synthesize `copy`/`move` from `get`+`put`+
 * `delete`. Widening `StorageProvider` itself would force every existing
 * adapter (and every test double) to implement these methods, so the
 * capability is kept separate and detected structurally at runtime.
 */
export interface ExtendedStorageProvider extends StorageProvider {
  /** Copies an object server-side (or via read+write) without deleting the source. */
  copy(from: string, to: string): Promise<StorageObjectMetadata>;
  /** Copies an object to a new key and removes the source once the copy succeeds. */
  move(from: string, to: string): Promise<StorageObjectMetadata>;
  /**
   * Streams a large upload directly to the backing store, bypassing the
   * buffer-based {@link StorageProvider.put}. Optional — callers should
   * fall back to buffering the stream and calling `put` when absent.
   */
  putStream?(
    key: string,
    stream: Readable,
    options?: StoragePutOptions,
  ): Promise<StorageObjectMetadata>;
}

/**
 * Structural check for the optional {@link ExtendedStorageProvider} surface.
 */
export function isExtendedStorageProvider(
  provider: StorageProvider,
): provider is ExtendedStorageProvider {
  const candidate = provider as Partial<ExtendedStorageProvider>;
  return (
    typeof candidate.copy === 'function' && typeof candidate.move === 'function'
  );
}

/**
 * Structural check for the optional streaming upload capability.
 */
export function supportsPutStream(
  provider: StorageProvider,
): provider is ExtendedStorageProvider & {
  putStream: NonNullable<ExtendedStorageProvider['putStream']>;
} {
  return (
    typeof (provider as Partial<ExtendedStorageProvider>).putStream ===
    'function'
  );
}

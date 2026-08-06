import { Injectable, Type } from '@nestjs/common';

export type DiscoveryKind = 'module' | 'provider';

export interface DiscoveryManifestEntry {
  readonly kind: DiscoveryKind;
  readonly target: Type<unknown>;
}

@Injectable()
export class ModuleDiscovery {
  private readonly modules = new Map<string, Type<unknown>>();
  private readonly providers = new Map<string, Type<unknown>>();

  public register(manifest: readonly DiscoveryManifestEntry[]): void {
    for (const entry of manifest) {
      if (
        (entry.kind !== 'module' && entry.kind !== 'provider') ||
        typeof entry.target !== 'function' ||
        entry.target.name.length === 0
      ) {
        throw new TypeError('Invalid discovery manifest entry');
      }
      const registry = entry.kind === 'module' ? this.modules : this.providers;
      registry.set(entry.target.name, entry.target);
    }
  }

  public getModules(): readonly Type<unknown>[] {
    return Object.freeze([...this.modules.values()]);
  }

  public getProviders(): readonly Type<unknown>[] {
    return Object.freeze([...this.providers.values()]);
  }

  public isRegistered(name: string, kind?: DiscoveryKind): boolean {
    if (kind === 'module') {
      return this.modules.has(name);
    }
    if (kind === 'provider') {
      return this.providers.has(name);
    }
    return this.modules.has(name) || this.providers.has(name);
  }
}

import { Injectable, type Type } from '@nestjs/common';

export type RegisteredModule = Type<unknown>;

/** Runtime catalog used for optional feature discovery. */
@Injectable()
export class ModuleRegistry {
  private readonly modules = new Map<string, RegisteredModule>();

  public register(name: string, module: RegisteredModule): void {
    if (name.trim().length === 0) {
      throw new Error('Module name must not be empty');
    }
    this.modules.set(name, module);
  }

  public has(name: string): boolean {
    return this.modules.has(name);
  }

  public get(name: string): RegisteredModule | undefined {
    return this.modules.get(name);
  }

  public list(): ReadonlyArray<
    Readonly<{ name: string; module: RegisteredModule }>
  > {
    return Array.from(this.modules, ([name, module]) => ({ name, module }));
  }
}

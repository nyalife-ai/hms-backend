export class LazyValue<T> {
  private initialized = false;
  private storedValue: T | undefined;

  public constructor(private readonly factory: () => T) {}

  public get value(): T {
    if (!this.initialized) {
      this.storedValue = this.factory();
      this.initialized = true;
    }
    return this.storedValue as T;
  }

  public get isInitialized(): boolean {
    return this.initialized;
  }
}

export function lazy<T>(factory: () => T): () => T {
  const value = new LazyValue(factory);
  return (): T => value.value;
}

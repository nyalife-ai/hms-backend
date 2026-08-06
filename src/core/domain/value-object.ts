const isBufferLike = (value: object): boolean =>
  typeof Buffer !== 'undefined' && Buffer.isBuffer(value);

const isUnsupportedMutable = (value: object): boolean =>
  value instanceof Map ||
  value instanceof Set ||
  value instanceof RegExp ||
  isBufferLike(value);

const assertSupportedProps = (
  value: unknown,
  ancestors: WeakSet<object> = new WeakSet(),
): void => {
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (value instanceof Date) {
    return;
  }
  if (isUnsupportedMutable(value)) {
    throw new TypeError(
      'ValueObject props cannot contain Map, Set, RegExp, or Buffer',
    );
  }
  if (ancestors.has(value)) {
    throw new TypeError('ValueObject props cannot contain cycles');
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      assertSupportedProps(item, ancestors);
    }
  } else {
    for (const item of Object.values(value as Record<string, unknown>)) {
      assertSupportedProps(item, ancestors);
    }
  }
  ancestors.delete(value);
};

const deepFreezeClone = <T>(
  value: T,
  seen: WeakMap<object, unknown> = new WeakMap(),
): T => {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }
  const existing = seen.get(value);
  if (existing !== undefined) {
    return existing as T;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) {
      copy.push(deepFreezeClone(item, seen));
    }
    return Object.freeze(copy) as T;
  }
  const proto = Object.getPrototypeOf(value) as object | null;
  const copy = Object.create(proto) as Record<string, unknown>;
  seen.set(value, copy);
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    copy[key] = deepFreezeClone(item, seen);
  }
  return Object.freeze(copy) as T;
};

const structuralEqual = (
  left: unknown,
  right: unknown,
  seen: WeakMap<object, object> = new WeakMap(),
): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false;
  }
  if (seen.get(left) === right) {
    return true;
  }
  seen.set(left, right);
  if (Array.isArray(left) !== Array.isArray(right)) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      structuralEqual(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        seen,
      ),
  );
};

/**
 * Immutable value object base.
 *
 * Equality is structural (based on {@link getEqualityComponents}).
 * Subclasses validate invariants in the constructor via {@link validate}
 * before assigning readonly fields.
 *
 * Props are defensively deep-cloned and deep-frozen. Map, Set, RegExp, Buffer,
 * and cyclic structures are rejected.
 *
 * @typeParam TProps - Shape of the underlying primitive/props bag.
 */
export abstract class ValueObject<TProps> {
  protected readonly props: Readonly<TProps>;

  protected constructor(props: Readonly<TProps>) {
    assertSupportedProps(props);
    this.props = deepFreezeClone(props);
    this.validate(this.props);
    Object.freeze(this);
  }

  /**
   * Structural equality based on equality components.
   */
  public equals(other: ValueObject<TProps> | null | undefined): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (this === other) {
      return true;
    }
    if (this.constructor !== other.constructor) {
      return false;
    }

    const left = this.getEqualityComponents();
    const right = other.getEqualityComponents();

    if (left.length !== right.length) {
      return false;
    }

    for (let i = 0; i < left.length; i += 1) {
      if (!structuralEqual(left[i], right[i])) {
        return false;
      }
    }
    return true;
  }

  /**
   * Components that participate in structural equality.
   * Override when props contain nested objects that need flattening.
   */
  protected getEqualityComponents(): ReadonlyArray<unknown> {
    if (this.props !== null && typeof this.props === 'object') {
      return Object.values(this.props as Record<string, unknown>);
    }
    return [this.props];
  }

  /**
   * Invariant validation hook. Throw on invalid props.
   * Default is a no-op for unconstrained value objects.
   */
  protected validate(props: Readonly<TProps>): void {
    void props;
  }

  /**
   * Exposes props for serialization / mapping layers.
   * Returns a shallow copy to preserve immutability of the internal bag.
   */
  public unpack(): Readonly<TProps> {
    if (this.props !== null && typeof this.props === 'object') {
      return { ...(this.props as object) } as Readonly<TProps>;
    }
    return this.props;
  }
}

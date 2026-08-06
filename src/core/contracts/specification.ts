/**
 * Specification pattern — composable business predicates.
 *
 * Use for domain rules and for translating filters into repository criteria
 * in platform adapters (without leaking ORM into core).
 */
export abstract class Specification<T> {
  public abstract isSatisfiedBy(candidate: T): boolean;

  public and(other: Specification<T>): Specification<T> {
    return new AndSpecification(this, other);
  }

  public or(other: Specification<T>): Specification<T> {
    return new OrSpecification(this, other);
  }

  public not(): Specification<T> {
    return new NotSpecification(this);
  }
}

export class AndSpecification<T> extends Specification<T> {
  public constructor(
    private readonly left: Specification<T>,
    private readonly right: Specification<T>,
  ) {
    super();
  }

  public isSatisfiedBy(candidate: T): boolean {
    return (
      this.left.isSatisfiedBy(candidate) && this.right.isSatisfiedBy(candidate)
    );
  }
}

export class OrSpecification<T> extends Specification<T> {
  public constructor(
    private readonly left: Specification<T>,
    private readonly right: Specification<T>,
  ) {
    super();
  }

  public isSatisfiedBy(candidate: T): boolean {
    return (
      this.left.isSatisfiedBy(candidate) || this.right.isSatisfiedBy(candidate)
    );
  }
}

export class NotSpecification<T> extends Specification<T> {
  public constructor(private readonly inner: Specification<T>) {
    super();
  }

  public isSatisfiedBy(candidate: T): boolean {
    return !this.inner.isSatisfiedBy(candidate);
  }
}

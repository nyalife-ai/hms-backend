interface MetadataReflect {
  readonly getMetadata?: (
    key: unknown,
    target: object,
    propertyKey?: PropertyKey,
  ) => unknown;
}
const readMetadata = (
  key: string,
  target: object,
  propertyKey?: PropertyKey,
): unknown =>
  (Reflect as MetadataReflect).getMetadata?.(key, target, propertyKey);

export const getParameterTypes = (
  target: object,
  propertyKey?: PropertyKey,
): readonly unknown[] =>
  (readMetadata('design:paramtypes', target, propertyKey) as
    readonly unknown[] | undefined) ?? [];
export const getReturnType = (
  target: object,
  propertyKey: PropertyKey,
): unknown => readMetadata('design:returntype', target, propertyKey);
export const getOwnMethodNames = (constructor: {
  readonly prototype: object;
}): string[] =>
  Object.getOwnPropertyNames(constructor.prototype).filter(
    (name) =>
      name !== 'constructor' &&
      typeof Object.getOwnPropertyDescriptor(constructor.prototype, name)
        ?.value === 'function',
  );
export const getOwnProperty = (target: object, key: PropertyKey): unknown =>
  Object.prototype.hasOwnProperty.call(target, key)
    ? Reflect.get(target, key)
    : undefined;
export const getPropertyDescriptor = (
  target: object,
  key: PropertyKey,
): PropertyDescriptor | undefined =>
  Object.getOwnPropertyDescriptor(target, key);

export type MetadataKey<T> = symbol & { readonly __metadataType?: T };

interface MetadataReflect {
  readonly defineMetadata?: (
    key: unknown,
    value: unknown,
    target: object,
    propertyKey?: PropertyKey,
  ) => void;
  readonly getMetadata?: (
    key: unknown,
    target: object,
    propertyKey?: PropertyKey,
  ) => unknown;
}

const metadataReflect = (): MetadataReflect => Reflect as MetadataReflect;

export const createMetadataKey = <T>(name: string): MetadataKey<T> =>
  Symbol(name);

export const setMetadata = <T>(
  key: MetadataKey<T>,
  value: T,
  target: object,
  propertyKey?: PropertyKey,
): boolean => {
  const define = metadataReflect().defineMetadata;
  if (define === undefined) return false;
  define(key, value, target, propertyKey);
  return true;
};

export const getMetadata = <T>(
  key: MetadataKey<T>,
  target: object,
  propertyKey?: PropertyKey,
): T | undefined =>
  metadataReflect().getMetadata?.(key, target, propertyKey) as T | undefined;

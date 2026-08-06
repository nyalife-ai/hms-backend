export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Maybe<T> = T | null | undefined;
export type Primitive =
  string | number | boolean | bigint | symbol | null | undefined;
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { readonly [key: string]: JsonValue };
export type DeepPartial<T> = T extends Primitive
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepPartial<U>[]
    : { [P in keyof T]?: DeepPartial<T[P]> };
export type DeepReadonly<T> = T extends Primitive
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : { readonly [P in keyof T]: DeepReadonly<T[P]> };
export type NonEmptyArray<T> = readonly [T, ...T[]];
export type Brand<T, B extends string> = T & { readonly __brand: B };

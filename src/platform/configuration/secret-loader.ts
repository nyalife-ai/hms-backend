import { Injectable } from '@nestjs/common';
import type { SecretProvider } from '../architecture/secret-provider.interface';

export type { SecretProvider } from '../architecture/secret-provider.interface';

export interface SecretSerialization {
  toJSON(): Readonly<Record<string, unknown>>;
  toString(): string;
}

export type SecretMapping =
  readonly string[] | Readonly<Record<string, string>>;

type SecretMappingKey<TMapping extends SecretMapping> =
  TMapping extends readonly (infer TKey extends string)[]
    ? TKey
    : keyof TMapping & string;

@Injectable()
export class SecretLoader {
  public constructor(private readonly provider: SecretProvider) {}

  public async load<
    T extends Readonly<Record<string, unknown>>,
    TMapping extends SecretMapping,
  >(
    config: T,
    mapping: TMapping,
  ): Promise<
    Readonly<T & Record<SecretMappingKey<TMapping>, string>> &
      SecretSerialization
  > {
    const entries = Array.isArray(mapping)
      ? mapping.map((key): readonly [string, string] => [key, key])
      : Object.entries(mapping);
    const loaded = await Promise.all(
      entries.map(async ([key, secretName]) => {
        const value = await this.provider.get(secretName);
        if (value === null) {
          throw new Error(`Secret "${secretName}" was not found`);
        }
        return [key, value] as const;
      }),
    );
    const secretKeys = new Set(loaded.map(([key]) => key));
    const values: Record<string, unknown> = { ...config };
    for (const [key, value] of loaded) {
      values[key] = value;
    }
    const serialize = (): Readonly<Record<string, unknown>> => {
      const masked: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(values)) {
        masked[key] = secretKeys.has(key) ? '***' : value;
      }
      return Object.freeze(masked);
    };
    Object.defineProperties(values, {
      toJSON: { value: serialize, enumerable: false },
      toString: {
        value: (): string => JSON.stringify(serialize()),
        enumerable: false,
      },
    });
    return Object.freeze(values) as Readonly<
      T & Record<SecretMappingKey<TMapping>, string>
    > &
      SecretSerialization;
  }
}

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { SECRET_PROVIDER as ARCHITECTURE_SECRET_PROVIDER } from '../../architecture';
import { ValidationException } from '../../../core';
import * as configurationExports from '../index';
import { ConfigFields, ConfigSchema } from '../config.schema';
import { ConfigValidator } from '../config-validator';
import { ConfigurationModule, SECRET_PROVIDER } from '../configuration.module';
import { ConfigurationService } from '../configuration.service';
import { resolveEnvironment } from '../environment';
import { SecretLoader, SecretProvider } from '../secret-loader';

type TestConfig = Readonly<{
  name: string;
  port: number;
  enabled: boolean;
  tags: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
  mode: string;
}>;

const fields: ConfigFields<TestConfig> = {
  name: { type: 'string', required: true, min: 2, max: 8 },
  port: { type: 'number', min: 1, max: 65_535 },
  enabled: { type: 'boolean', default: true },
  tags: { type: 'array', min: 1, max: 2 },
  metadata: { type: 'object' },
  mode: {
    type: 'string',
    enum: ['safe', 'fast'],
    custom: (value): boolean | string =>
      value === 'safe' || 'unsafe mode is disabled',
  },
};

describe('configuration platform', () => {
  it('validates fields and applies defaults', () => {
    const result = new ConfigSchema(fields).validate({
      name: 'api',
      port: 3000,
      tags: ['one'],
      metadata: {},
      mode: 'safe',
      ignored: true,
    });
    expect(result).toEqual({
      value: {
        name: 'api',
        port: 3000,
        enabled: true,
        tags: ['one'],
        metadata: {},
        mode: 'safe',
      },
    });
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it('aggregates required, type, enum, range, and custom failures', () => {
    const result = new ConfigSchema(fields).validate({
      port: 0,
      enabled: 'yes',
      tags: [],
      metadata: [],
      mode: 'other',
    });
    expect(result.errors?.map(({ field }) => field)).toEqual([
      'name',
      'port',
      'enabled',
      'tags',
      'metadata',
      'mode',
      'mode',
    ]);
    expect(result.errors?.at(-1)?.message).toBe('unsafe mode is disabled');

    const tooLarge = new ConfigSchema(fields).validate({
      name: 'too-long-name',
      port: 100_000,
      enabled: true,
      tags: ['a', 'b', 'c'],
      metadata: {},
      mode: 'safe',
    });
    expect(tooLarge.errors).toHaveLength(3);
  });

  it('supports boolean custom failures and optional absent fields', () => {
    type OptionalConfig = Readonly<{ value: string; missing: string }>;
    const schema = new ConfigSchema<OptionalConfig>({
      value: { type: 'string', custom: (): boolean => false },
      missing: { type: 'string' },
    });
    expect(schema.validate({ value: 'x' })).toEqual({
      errors: [{ field: 'value', message: 'failed custom validation' }],
    });
  });

  it('throws a core validation exception with all field errors', () => {
    const validator = new ConfigValidator();
    const schema = new ConfigSchema(fields);
    expect(() => validator.validate({}, schema)).toThrow(ValidationException);
    try {
      validator.validate({}, schema);
    } catch (error: unknown) {
      expect((error as ValidationException).fieldErrors).toEqual([
        { field: 'name', message: 'is required' },
      ]);
    }
    expect(
      validator.validate(
        {
          name: 'api',
          port: 80,
          enabled: false,
          tags: ['x'],
          metadata: {},
          mode: 'safe',
        },
        schema,
      ).port,
    ).toBe(80);
  });

  it('resolves supported environments and rejects invalid input', () => {
    expect(resolveEnvironment(undefined)).toBe('development');
    expect(resolveEnvironment(' ')).toBe('development');
    expect(resolveEnvironment('STAGING')).toBe('staging');
    expect(resolveEnvironment('production')).toBe('production');
    expect(() => resolveEnvironment('test')).toThrow(RangeError);
  });

  it('loads secrets concurrently and masks every serialization path', async () => {
    const pending: string[] = [];
    const provider: SecretProvider = {
      get: async (name): Promise<string> => {
        pending.push(name);
        await Promise.resolve();
        return `${name}-value`;
      },
    };
    const loaded = await new SecretLoader(provider).load(
      { public: 'visible' },
      { token: 'api-token', password: 'db-password' },
    );
    expect(pending).toEqual(['api-token', 'db-password']);
    expect(loaded.token).toBe('api-token-value');
    expect(loaded.toJSON()).toEqual({
      public: 'visible',
      token: '***',
      password: '***',
    });
    expect(JSON.parse(JSON.stringify(loaded))).toEqual(loaded.toJSON());
    expect(loaded.toString()).not.toContain('api-token-value');

    const sameNames = await new SecretLoader(provider).load({}, ['token']);
    expect(sameNames.token).toBe('token-value');
  });

  it('fails on a missing secret and recovers on a later load', async () => {
    let available = false;
    const loader = new SecretLoader({
      get: async (): Promise<string | null> => (available ? 'recovered' : null),
    });
    await expect(loader.load({}, ['token'])).rejects.toThrow('was not found');
    available = true;
    await expect(loader.load({}, ['token'])).resolves.toMatchObject({
      token: 'recovered',
    });
  });

  it('provides typed nested reads and an immutable snapshot', () => {
    const original = { nested: { value: 3 }, list: [1], when: new Date(0) };
    const service = new ConfigurationService(original, 'production');
    original.nested.value = 4;
    expect(service.get<number>('nested.value')).toBe(3);
    expect(service.get('missing')).toBeUndefined();
    expect(service.getOrThrow<number>('nested.value')).toBe(3);
    expect(() => service.getOrThrow('missing')).toThrow('Missing');
    expect(() => service.get(' ')).toThrow(TypeError);
    expect(service.get('nested.value.more')).toBeUndefined();
    expect(service.isEnvironment('production')).toBe(true);
    expect(service.isEnvironment('staging')).toBe(false);
    expect(Object.isFrozen(service.snapshot())).toBe(true);
    expect(Object.isFrozen(service.get<readonly number[]>('list'))).toBe(true);
    expect(service.get<Date>('when')).toEqual(new Date(0));
    expect(new ConfigurationService().snapshot()).toEqual({});
  });

  it('wires default, validated, and secret-aware dynamic modules', async () => {
    expect(configurationExports.ConfigurationService).toBe(
      ConfigurationService,
    );
    const defaults = await Test.createTestingModule({
      imports: [ConfigurationModule.register()],
    }).compile();
    expect(defaults.get(ConfigurationService).environment).toBe('development');
    await defaults.close();

    type Defaulted = Readonly<{ value: string }>;
    const defaultedSchema = new ConfigSchema<Defaulted>({
      value: { type: 'string', default: 'default' },
    });
    const defaulted = await Test.createTestingModule({
      imports: [ConfigurationModule.register({ schema: defaultedSchema })],
    }).compile();
    expect(defaulted.get(ConfigurationService).get('value')).toBe('default');
    await defaulted.close();

    type Simple = Readonly<{ value: string }>;
    const schema = new ConfigSchema<Simple>({
      value: { type: 'string', required: true },
    });
    const provider: SecretProvider = {
      get: async (): Promise<string> => 'secret',
    };
    const configured = await Test.createTestingModule({
      imports: [
        ConfigurationModule.register({
          values: { value: 'ok' },
          schema,
          environment: 'staging',
          secretProvider: provider,
        }),
      ],
    }).compile();
    expect(configured.get(ConfigurationService).get('value')).toBe('ok');
    expect(SECRET_PROVIDER).toBe(ARCHITECTURE_SECRET_PROVIDER);
    expect(configured.get(SECRET_PROVIDER)).toBe(provider);
    expect(configured.get(SecretLoader)).toBeInstanceOf(SecretLoader);
    await configured.close();
    expect(() => ConfigurationModule.register({ schema, values: {} })).toThrow(
      ValidationException,
    );
  });
});

import 'reflect-metadata';
import { Module, type DynamicModule } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ArchitectureModule,
  CLOCK,
  ModuleRegistry,
  SystemClock,
  allowInMemoryDefaults,
  assertNoForbiddenImports,
  assertPositiveInteger,
  buildDynamicModule,
  createClassProvider,
  createFactoryProvider,
  createMetadataKey,
  createProviderToken,
  createSetMetadataDecorator,
  createValueProvider,
  dynamicModuleFromMetadata,
  getMetadata,
  resolveIsProduction,
  setMetadata,
} from '..';
import type { Clock } from '../../../core';

class ExampleService {}

@Module({})
class ExampleModule {}

describe('platform architecture', () => {
  it('creates deterministic provider tokens and provider descriptors', () => {
    const token = createProviderToken('EXAMPLE');
    expect(token).toBe(Symbol.for('platform.EXAMPLE'));
    expect(createValueProvider(token, 7)).toEqual({
      provide: token,
      useValue: 7,
    });
    const factory = (): string => 'value';
    expect(createFactoryProvider(token, factory)).toEqual({
      provide: token,
      useFactory: factory,
      inject: [],
    });
    expect(createFactoryProvider(token, factory, [CLOCK]).inject).toEqual([
      CLOCK,
    ]);
    expect(createClassProvider(token, ExampleService)).toEqual({
      provide: token,
      useClass: ExampleService,
    });
  });

  it('builds normalized dynamic modules', () => {
    expect(buildDynamicModule(ExampleModule)).toEqual({
      module: ExampleModule,
      global: undefined,
      imports: [],
      providers: [],
      exports: [],
    });
    const nested: DynamicModule = { module: ExampleModule };
    expect(
      buildDynamicModule(ExampleModule, {
        global: true,
        imports: [nested],
        providers: [ExampleService],
        exports: [ExampleService],
      }),
    ).toMatchObject({ global: true, imports: [nested] });
    expect(
      dynamicModuleFromMetadata(ExampleModule, {
        imports: [nested],
        providers: [ExampleService],
        exports: [ExampleService],
      }),
    ).toMatchObject({
      module: ExampleModule,
      imports: [nested],
      providers: [ExampleService],
      exports: [ExampleService],
    });
  });

  it('registers, replaces, discovers, and validates modules', () => {
    const registry = new ModuleRegistry();
    expect(registry.has('example')).toBe(false);
    expect(registry.get('example')).toBeUndefined();
    registry.register('example', ExampleModule);
    registry.register('example', ArchitectureModule);
    expect(registry.has('example')).toBe(true);
    expect(registry.get('example')).toBe(ArchitectureModule);
    expect(registry.list()).toEqual([
      { name: 'example', module: ArchitectureModule },
    ]);
    expect(() => registry.register(' ', ExampleModule)).toThrow(
      'Module name must not be empty',
    );
  });

  it('enforces dependency boundaries across import forms and separators', () => {
    expect(() =>
      assertNoForbiddenImports(
        "import value from 'safe'; export { x } from 'blocked/sub';",
        ['blocked'],
      ),
    ).toThrow('Forbidden dependency "blocked/sub"');
    expect(() =>
      assertNoForbiddenImports("const x = require('blocked\\nested')", [
        'blocked/nested',
      ]),
    ).toThrow('Forbidden dependency');
    expect(() =>
      assertNoForbiddenImports("import 'safe';", ['blocked']),
    ).not.toThrow();
  });

  it('provides the global registry and system clock', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ArchitectureModule],
    }).compile();
    expect(moduleRef.get(ModuleRegistry)).toBeInstanceOf(ModuleRegistry);
    expect(moduleRef.get<Clock>(CLOCK)).toBeInstanceOf(SystemClock);

    const clock = new SystemClock();
    const before = Date.now();
    expect(clock.now()).toBeInstanceOf(Date);
    expect(clock.timestamp()).toBeGreaterThanOrEqual(before);
    await moduleRef.close();
  });

  it('exposes Nest-compatible typed metadata decorators', () => {
    const key = createMetadataKey<string>('role');
    const decorate = createSetMetadataDecorator(key);
    @decorate('reader')
    class Example {}
    expect(Reflect.getMetadata(key, Example)).toBe('reader');
    expect(setMetadata(key, 'writer', Example)).toBe(true);
    expect(getMetadata(key, Example)).toBe('writer');
  });

  it('resolves production defaults and validates positive integers', () => {
    const previous = process.env['NODE_ENV'];
    delete process.env['NODE_ENV'];
    expect(resolveIsProduction()).toBe(false);
    expect(allowInMemoryDefaults()).toBe(true);
    process.env['NODE_ENV'] = 'production';
    expect(resolveIsProduction()).toBe(true);
    expect(allowInMemoryDefaults()).toBe(false);
    if (previous === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = previous;
    }
    expect(resolveIsProduction({ isProduction: true })).toBe(true);
    expect(resolveIsProduction({ isProduction: false })).toBe(false);
    expect(resolveIsProduction({ environment: 'production' })).toBe(true);
    expect(resolveIsProduction({ environment: 'staging' })).toBe(false);
    expect(allowInMemoryDefaults({ isProduction: false })).toBe(true);
    expect(allowInMemoryDefaults({ isProduction: true })).toBe(false);
    expect(
      allowInMemoryDefaults({ isProduction: true, allowInMemory: true }),
    ).toBe(true);
    expect(assertPositiveInteger(3, 'limit')).toBe(3);
    expect(() => assertPositiveInteger(0, 'limit')).toThrow(RangeError);
    expect(() => assertPositiveInteger(1.5, 'limit')).toThrow(RangeError);
  });
});

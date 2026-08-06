import 'reflect-metadata';
import {
  createMetadataKey,
  getMetadata,
  getOwnMethodNames,
  getOwnProperty,
  getParameterTypes,
  getPropertyDescriptor,
  getReturnType,
  setMetadata,
} from '..';

describe('metadata helpers', () => {
  it('sets and gets typed metadata', () => {
    const key = createMetadataKey<number>('count');
    const target = {};
    expect(setMetadata(key, 3, target)).toBe(true);
    expect(getMetadata(key, target)).toBe(3);
    expect(setMetadata(key, 4, target, 'method')).toBe(true);
    expect(getMetadata(key, target, 'method')).toBe(4);
    expect(getMetadata(createMetadataKey('missing'), target)).toBeUndefined();
  });

  it('guards environments without reflect-metadata support', () => {
    const metadataReflect = Reflect as unknown as {
      defineMetadata?: unknown;
      getMetadata?: unknown;
    };
    const define = metadataReflect.defineMetadata;
    const get = metadataReflect.getMetadata;
    delete metadataReflect.defineMetadata;
    delete metadataReflect.getMetadata;
    const key = createMetadataKey<string>('key');
    expect(setMetadata(key, 'value', {})).toBe(false);
    expect(getMetadata(key, {})).toBeUndefined();
    metadataReflect.defineMetadata = define;
    metadataReflect.getMetadata = get;
  });
});

describe('reflection helpers', () => {
  it('reads design metadata with safe defaults', () => {
    class Example {
      public method(value: string): number {
        void value;
        return 1;
      }
      public get accessor(): number {
        return 1;
      }
      public property = 2;
    }
    Reflect.defineMetadata(
      'design:paramtypes',
      [String],
      Example.prototype,
      'method',
    );
    Reflect.defineMetadata(
      'design:returntype',
      Number,
      Example.prototype,
      'method',
    );
    expect(getParameterTypes(Example.prototype, 'method')).toEqual([String]);
    expect(getParameterTypes(Example.prototype, 'missing')).toEqual([]);
    expect(getReturnType(Example.prototype, 'method')).toBe(Number);
    expect(getReturnType(Example.prototype, 'missing')).toBeUndefined();
    expect(getOwnMethodNames(Example)).toEqual(['method']);
    const instance = new Example();
    expect(getOwnProperty(instance, 'property')).toBe(2);
    expect(getOwnProperty(instance, 'method')).toBeUndefined();
    expect(getPropertyDescriptor(instance, 'property')).toMatchObject({
      value: 2,
    });
    expect(getPropertyDescriptor(instance, 'missing')).toBeUndefined();
  });

  it('returns safe metadata defaults without reflection support', () => {
    const metadataReflect = Reflect as unknown as { getMetadata?: unknown };
    const get = metadataReflect.getMetadata;
    delete metadataReflect.getMetadata;
    expect(getParameterTypes({})).toEqual([]);
    expect(getReturnType({}, 'x')).toBeUndefined();
    metadataReflect.getMetadata = get;
  });
});

import type {
  ClassProvider,
  FactoryProvider,
  InjectionToken,
  Type,
  ValueProvider,
} from '@nestjs/common';

export const createProviderToken = (description: string): symbol =>
  Symbol.for(`platform.${description}`);

export const createValueProvider = <T>(
  provide: InjectionToken,
  useValue: T,
): ValueProvider<T> => ({ provide, useValue });

export const createFactoryProvider = <
  T,
  TDependencies extends readonly unknown[] = readonly unknown[],
>(
  provide: InjectionToken,
  useFactory: (...dependencies: TDependencies) => T | Promise<T>,
  inject: FactoryProvider<T>['inject'] = [],
): FactoryProvider<T> => ({
  provide,
  useFactory: useFactory as FactoryProvider<T>['useFactory'],
  inject,
});

export const createClassProvider = <T>(
  provide: InjectionToken,
  useClass: Type<T>,
): ClassProvider<T> => ({ provide, useClass });

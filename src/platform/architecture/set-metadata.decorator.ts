import { SetMetadata } from '@nestjs/common';
import {
  type MetadataKey,
  createMetadataKey,
  getMetadata,
  setMetadata,
} from '../../shared/decorators/metadata.helpers';

export { createMetadataKey, getMetadata, setMetadata };
export type { MetadataKey };

/**
 * NestJS-bound typed metadata decorator factory.
 * Lives in platform (not shared) so shared stays framework-independent.
 */
export const createSetMetadataDecorator =
  <T>(key: MetadataKey<T>): ((value: T) => MethodDecorator & ClassDecorator) =>
  (value: T): MethodDecorator & ClassDecorator =>
    SetMetadata(key, value);

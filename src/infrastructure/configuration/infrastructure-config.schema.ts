import { ConfigSchema } from '../../platform/configuration';

export type InfrastructureConfig = Readonly<{
  NODE_ENV: 'development' | 'staging' | 'production';
  ORM_PROVIDER: 'prisma' | 'typeorm';
  DATABASE_URL?: string;
  DATABASE_HOST?: string;
  DATABASE_PORT: number;
  DATABASE_NAME?: string;
  DATABASE_USER?: string;
  DATABASE_PASSWORD?: string;
  REDIS_URL?: string;
  MESSAGE_BROKER_URL?: string;
  EXTERNAL_API_URL?: string;
  EXTERNAL_API_TOKEN?: string;
}>;

const isUrl = (value: string | undefined): boolean => {
  try {
    new URL(value as string);
    return true;
  } catch {
    return false;
  }
};

export const infrastructureConfigSchema =
  new ConfigSchema<InfrastructureConfig>({
    NODE_ENV: {
      type: 'string',
      default: 'development',
      enum: ['development', 'staging', 'production'],
    },
    ORM_PROVIDER: {
      type: 'string',
      default: 'prisma',
      enum: ['prisma', 'typeorm'],
    },
    DATABASE_URL: { type: 'string', min: 1, custom: isUrl },
    DATABASE_HOST: { type: 'string', min: 1 },
    DATABASE_PORT: { type: 'number', default: 5432, min: 1, max: 65535 },
    DATABASE_NAME: { type: 'string', min: 1 },
    DATABASE_USER: { type: 'string', min: 1 },
    DATABASE_PASSWORD: { type: 'string', min: 1 },
    REDIS_URL: { type: 'string', min: 1, custom: isUrl },
    MESSAGE_BROKER_URL: { type: 'string', min: 1, custom: isUrl },
    EXTERNAL_API_URL: { type: 'string', min: 1, custom: isUrl },
    EXTERNAL_API_TOKEN: { type: 'string', min: 1 },
  });

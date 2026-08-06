import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../config.module';
import { ConfigService } from '@nestjs/config';

/**
 * Unit Tests for ConfigModule.
 *
 * Verifies that the NestJS module correctly initialises the
 * underlying @nestjs/config module and exports it globally.
 */
describe('ConfigModule', () => {
  let module: TestingModule;
  let configService: ConfigService;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DB_TYPE = 'postgres';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USERNAME = 'test';
    process.env.DB_PASSWORD = 'test';
    process.env.DB_NAME = 'test';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.JWT_SECRET = 'test-secret-key-12345678901234567890123456789012';
    process.env.JWT_EXPIRATION = '1d';
    process.env.ENCRYPTION_SECRET_KEY = 'abcdefghijklmnopqrstuvwxyz123456';
    process.env.ORM_TYPE = 'prisma';

    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
    }).compile();

    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide ConfigService', () => {
    expect(configService).toBeDefined();
  });

  it('should load custom configuration via ConfigService', () => {
    const appConfig = configService.get('app');

    expect(appConfig).toBeDefined();
    expect(appConfig?.port).toBe(3000);
    expect(appConfig?.environment).toBe('test');
  });

  it('should correctly retrieve nested configuration values', () => {
    const dbHost = configService.get<string>('database.host');
    const dbPort = configService.get<number>('database.port');

    expect(dbHost).toBe('localhost');
    expect(dbPort).toBe(5432);
  });
});

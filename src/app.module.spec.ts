import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { ConfigService } from '@nestjs/config';

/**
 * Lightweight AppModule unit smoke test.
 *
 * The full AppModule pulls in TypeORM/Prisma, Redis, and feature modules.
 * Compiling it requires live infrastructure, so this suite verifies the
 * root controller/service wiring in isolation instead.
 */
describe('AppModule (root wiring)', () => {
  let module: TestingModule;

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
      controllers: [AppController],
      providers: [AppService],
    }).compile();
  });

  it('should compile root providers successfully', () => {
    expect(module).toBeDefined();
  });

  it('should provide AppController', () => {
    const controller = module.get<AppController>(AppController);
    expect(controller).toBeDefined();
  });

  it('should provide AppService', () => {
    const service = module.get<AppService>(AppService);
    expect(service).toBeDefined();
  });

  it('should provide ConfigService', () => {
    const config = module.get<ConfigService>(ConfigService);
    expect(config).toBeDefined();
  });

  it('AppModule class should be defined', () => {
    expect(AppModule).toBeDefined();
  });
});

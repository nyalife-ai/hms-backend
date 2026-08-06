import { Module, DynamicModule, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Database Module — dual-ORM switchboard.
 *
 * Exactly one ORM is active per deployment, selected by `ORM_PROVIDER`
 * (`ORM_TYPE` is retained as a compatibility fallback):
 *
 *   ORM_PROVIDER=prisma   → imports {@link PrismaModule}
 *   ORM_PROVIDER=typeorm  → configures TypeORM via {@link TypeOrmModule.forRootAsync}
 *
 * Switch by changing the environment variable; no code changes required.
 * Feature modules should depend on repository abstractions, not a concrete ORM.
 */
@Module({})
export class DatabaseModule {
  private static readonly logger = new Logger(DatabaseModule.name);

  static forRoot(): DynamicModule {
    const ormType = (
      process.env.ORM_PROVIDER ??
      process.env.ORM_TYPE ??
      'prisma'
    ).toLowerCase();

    if (ormType === 'prisma') {
      DatabaseModule.logger.log('DatabaseModule: using Prisma');
      return {
        module: DatabaseModule,
        imports: [PrismaModule],
        exports: [PrismaModule],
      };
    }

    if (ormType !== 'typeorm') {
      throw new Error(
        `Unsupported ORM provider "${ormType}"; expected "prisma" or "typeorm"`,
      );
    }
    DatabaseModule.logger.log('DatabaseModule: using TypeORM');

    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            type: (configService.get<string>('database.type') || 'postgres') as
              'postgres' | 'mysql' | 'sqlite',
            host: configService.get<string>('database.host'),
            port: configService.get<number>('database.port'),
            username: configService.get<string>('database.username'),
            password: configService.get<string>('database.password'),
            database: configService.get<string>('database.name'),
            autoLoadEntities: true,
            entities: [__dirname + '/../modules/**/entities/*{.js,.ts}'],
            migrations: [__dirname + '/migrations/**/*{.js,.ts}'],
            // NEVER enable synchronize in production — use migrations instead.
            synchronize:
              configService.get<boolean>('database.synchronize') === true &&
              configService.get<string>('app.environment') !== 'production',
            logging:
              configService.get<string>('app.environment') !== 'production',
            migrationsRun: false,
            extra: {
              // Pool settings suitable for most API services; tune per workload.
              max: 20,
              idleTimeoutMillis: 30_000,
              connectionTimeoutMillis: 5_000,
            },
          }),
        }),
      ],
      exports: [TypeOrmModule],
    };
  }
}

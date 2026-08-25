import { Module, forwardRef } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthController } from './auth.controller';
import { AuthMailService } from './auth-mail.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';
import { AUTH_USER_REPOSITORY } from './repositories/auth-user.repository.interface';
import { PrismaAuthUserRepository } from './repositories/prisma-auth-user.repository';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    forwardRef(() => NotificationsModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>(
          'jwt.secret',
          'default-dev-secret-change-in-production',
        ),
        signOptions: {
          expiresIn: config.get('jwt.expiration') || '15m',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthMailService,
    PrismaAuthUserRepository,
    { provide: AUTH_USER_REPOSITORY, useExisting: PrismaAuthUserRepository },
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    JwtModule,
    AUTH_USER_REPOSITORY,
  ],
})
export class AuthModule {}

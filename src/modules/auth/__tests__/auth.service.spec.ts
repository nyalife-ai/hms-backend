/**
 * AuthService unit tests with repository mock.
 */

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth.service';
import type { IAuthUserRepository } from '../repositories/auth-user.repository.interface';
import type { AuthUser } from '../auth.types';

describe('AuthService', () => {
  const user: AuthUser = {
    id: 'u1',
    email: 'a@test.com',
    name: 'A',
    role: 'ADMIN',
    position: 'Admin',
    passwordHash: '',
    permissions: ['admin'],
  };

  let users: jest.Mocked<IAuthUserRepository>;
  let service: AuthService;

  beforeEach(async () => {
    user.passwordHash = await bcrypt.hash('secret123', 4);
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByRole: jest.fn(),
      listActiveUsers: jest.fn(),
      touchLastLogin: jest.fn(),
      updatePasswordHash: jest.fn(),
      createRefreshToken: jest.fn(),
      findRefreshByHash: jest.fn(),
      revokeRefreshByHash: jest.fn(),
      revokeAllForUser: jest.fn(),
      registerPatient: jest.fn(),
      findPasswordResetByHash: jest.fn(),
      syncRoleModulePermissions: jest.fn().mockResolvedValue(undefined),
    };
    service = new AuthService(
      { sign: jest.fn().mockReturnValue('access') } as unknown as JwtService,
      {
        get: jest.fn((key: string, def?: string) => {
          if (key === 'jwt.expiration') return '15m';
          if (key === 'JWT_REFRESH_DAYS') return '7';
          if (key === 'ENABLE_DEMO_AUTH') return 'false';
          if (key === 'app.environment') return 'test';
          return def;
        }),
      } as unknown as ConfigService,
      users,
      {
        recordMutation: jest.fn().mockResolvedValue(undefined),
        recordAccess: jest.fn().mockResolvedValue(undefined),
      } as any,
    );
  });

  it('logs in with valid credentials', async () => {
    users.findByEmail.mockResolvedValue(user);
    const res = await service.login('a@test.com', 'secret123');
    expect(res.accessToken).toBe('access');
    expect(users.createRefreshToken).toHaveBeenCalled();
    expect(users.touchLastLogin).toHaveBeenCalledWith('u1');
  });

  it('rejects bad password', async () => {
    users.findByEmail.mockResolvedValue(user);
    await expect(service.login('a@test.com', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects invalid refresh token', async () => {
    users.findRefreshByHash.mockResolvedValue(null);
    await expect(
      service.refresh('invalid-refresh-token-value'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

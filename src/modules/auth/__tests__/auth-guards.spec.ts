/**
 * Auth guards / JWT strategy — behavioral coverage for RC1 auth surface.
 */

import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PermissionsGuard } from '../permissions.guard';
import { RolesGuard } from '../roles.guard';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { JwtStrategy } from '../jwt.strategy';
import { PERMISSIONS_KEY } from '../permissions.decorator';
import { ROLES_KEY } from '../roles.decorator';
import { AuthService } from '../auth.service';

function mockContext(user?: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as never;
}

describe('Auth guards', () => {
  it('PermissionsGuard allows when no permissions required', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    expect(new PermissionsGuard(reflector).canActivate(mockContext({ permissions: [] }))).toBe(true);
  });

  it('PermissionsGuard allows empty required list', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([]) } as unknown as Reflector;
    expect(new PermissionsGuard(reflector).canActivate(mockContext())).toBe(true);
  });

  it('PermissionsGuard allows matching permission and wildcard', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['billing:read']) } as unknown as Reflector;
    expect(new PermissionsGuard(reflector).canActivate(mockContext({ permissions: ['billing:read'] }))).toBe(true);
    expect(new PermissionsGuard(reflector).canActivate(mockContext({ permissions: ['*'] }))).toBe(true);
  });

  it('PermissionsGuard denies missing permission or missing user', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['billing:write']) } as unknown as Reflector;
    expect(() => new PermissionsGuard(reflector).canActivate(mockContext({ permissions: ['billing:read'] }))).toThrow(ForbiddenException);
    expect(() => new PermissionsGuard(reflector).canActivate(mockContext())).toThrow(ForbiddenException);
  });

  it('RolesGuard allows matching role and SUPER_ADMIN bypass', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['ADMIN']) } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(mockContext({ role: 'ADMIN' }))).toBe(true);
    const nurseOnly = { getAllAndOverride: jest.fn().mockReturnValue(['NURSE']) } as unknown as Reflector;
    expect(new RolesGuard(nurseOnly).canActivate(mockContext({ role: 'SUPER_ADMIN' }))).toBe(true);
  });

  it('RolesGuard denies non-matching role or missing user', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['ADMIN']) } as unknown as Reflector;
    expect(() => new RolesGuard(reflector).canActivate(mockContext({ role: 'NURSE' }))).toThrow(ForbiddenException);
    expect(() => new RolesGuard(reflector).canActivate(mockContext())).toThrow(ForbiddenException);
  });

  it('RolesGuard allows when no roles required', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(mockContext())).toBe(true);
  });

  it('JwtAuthGuard skips auth for public routes', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector;
    expect(new JwtAuthGuard(reflector).canActivate(mockContext())).toBe(true);
  });

  it('decorator keys are stable', () => {
    expect(PERMISSIONS_KEY).toBe('permissions');
    expect(ROLES_KEY).toBe('roles');
  });
});

describe('JwtStrategy', () => {
  const config = { get: jest.fn().mockReturnValue('test-secret-at-least-32-chars-long!!') } as unknown as ConfigService;

  it('rejects payload without sub', async () => {
    const strategy = new JwtStrategy(config, { validateAccessUser: jest.fn() } as unknown as AuthService);
    await expect(strategy.validate({} as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects inactive users', async () => {
    const strategy = new JwtStrategy(config, { validateAccessUser: jest.fn().mockResolvedValue(null) } as unknown as AuthService);
    await expect(strategy.validate({ sub: 'u1' } as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns public user when active', async () => {
    const publicUser = { id: 'u1', email: 'a@test.com', role: 'ADMIN' };
    const strategy = new JwtStrategy(config, { validateAccessUser: jest.fn().mockResolvedValue(publicUser) } as unknown as AuthService);
    await expect(strategy.validate({ sub: 'u1' } as never)).resolves.toEqual(publicUser);
  });
});

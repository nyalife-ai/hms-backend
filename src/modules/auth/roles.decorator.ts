import { SetMetadata } from '@nestjs/common';
import type { HmsRole } from './auth.types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: HmsRole[]) => SetMetadata(ROLES_KEY, roles);

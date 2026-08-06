import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PermissionEvaluator } from './permission-evaluator';
import type { Action, Principal, Resource } from './types';

export const POLICY_METADATA = 'security:policy';
export interface RequiredPolicy {
  readonly action: Action;
  readonly resource: Resource;
}

interface PrincipalRequest extends Request {
  readonly user?: Principal;
}

@Injectable()
export class PolicyGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly evaluator: PermissionEvaluator,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<RequiredPolicy>(
      POLICY_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!policy) return true;
    const principal = context
      .switchToHttp()
      .getRequest<PrincipalRequest>().user;
    if (
      !principal ||
      !(await this.evaluator.can({
        principal,
        action: policy.action,
        resource: policy.resource,
      }))
    ) {
      throw new ForbiddenException('Permission denied');
    }
    return true;
  }
}

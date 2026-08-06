import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class CsrfGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const cookie = readCookie(request, 'csrf-token');
    const header = request.headers['x-csrf-token'];
    const headerValue = Array.isArray(header) ? header[0] : header;
    if (typeof cookie !== 'string' || typeof headerValue !== 'string') {
      throw new UnauthorizedException('Invalid CSRF token');
    }
    const left = Buffer.from(cookie);
    const right = Buffer.from(headerValue);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException('Invalid CSRF token');
    }
    return true;
  }
}

function readCookie(request: Request, name: string): unknown {
  const cookies: unknown = request.cookies;
  if (cookies === null || typeof cookies !== 'object') {
    return undefined;
  }
  return (cookies as Record<string, unknown>)[name];
}

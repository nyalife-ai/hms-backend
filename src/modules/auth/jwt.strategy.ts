import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';
import type { AuthUserPublic, JwtPayload } from './auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>(
        'jwt.secret',
        'default-dev-secret-change-in-production',
      ),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUserPublic> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token');
    }
    const user = await this.auth.validateAccessUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User inactive or not found');
    }
    return user;
  }
}

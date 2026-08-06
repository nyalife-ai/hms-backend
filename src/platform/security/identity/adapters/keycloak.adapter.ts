import { HttpIdentityProvider } from './base-http.adapter';

export class KeycloakIdentityProvider extends HttpIdentityProvider {
  protected readonly tokenPath = '/protocol/openid-connect/token';
  protected readonly userInfoPath = '/protocol/openid-connect/userinfo';
}

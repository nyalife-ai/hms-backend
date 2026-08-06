import { HttpIdentityProvider } from './base-http.adapter';

export class Auth0IdentityProvider extends HttpIdentityProvider {
  protected readonly tokenPath = '/oauth/token';
  protected readonly userInfoPath = '/userinfo';
}

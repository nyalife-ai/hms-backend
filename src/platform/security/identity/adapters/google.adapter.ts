import { HttpIdentityProvider } from './base-http.adapter';

export class GoogleIdentityProvider extends HttpIdentityProvider {
  protected readonly tokenPath = '/token';
  protected readonly userInfoPath = '/userinfo';
}

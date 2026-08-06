import { HttpIdentityProvider } from './base-http.adapter';

export class AzureAdIdentityProvider extends HttpIdentityProvider {
  protected readonly tokenPath = '/oauth2/v2.0/token';
  protected readonly userInfoPath = '/oidc/userinfo';
}

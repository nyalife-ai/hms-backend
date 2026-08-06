import { DynamicModule, Module } from '@nestjs/common';
import { HttpClientService } from './http/http-client.service';
import type { HttpClientServiceOptions } from './http/http.types';

export const EXTERNAL_HTTP_CLIENT = Symbol('EXTERNAL_HTTP_CLIENT');

@Module({})
export class ExternalServicesModule {
  public static register(
    httpOptions: HttpClientServiceOptions = {},
  ): DynamicModule {
    return {
      module: ExternalServicesModule,
      providers: [
        {
          provide: EXTERNAL_HTTP_CLIENT,
          useFactory: (): HttpClientService =>
            new HttpClientService(httpOptions),
        },
      ],
      exports: [EXTERNAL_HTTP_CLIENT],
    };
  }
}

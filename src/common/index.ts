/**
 * Shared scaffold utilities — decorators, filters, interceptors, middleware,
 * and security helpers that every NestJS API built on this template can reuse.
 */
export { Public, IS_PUBLIC_KEY } from './decorators/public.decorator';
export { CurrentUser } from './decorators/user.decorator';
export { HttpExceptionFilter } from './filters/http-exception.filter';
export { HttpMetricsInterceptor } from './interceptors/http-metrics.interceptor';
export {
  RequestIdMiddleware,
  REQUEST_ID_HEADER,
} from './middleware/request-id.middleware';
export { EncryptionService } from './security/encryption.service';
export type {
  AppLoggerPort,
  HttpRequestLogData,
} from './logging/app-logger.port';
export type {
  HttpMetricsPort,
  LabeledCounter,
  LabeledGauge,
  LabeledHistogram,
} from './metrics/http-metrics.port';

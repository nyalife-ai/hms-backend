import { ValidationPipe, type Provider } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AuthGuard } from '../../../platform/security/auth/guards/auth.guard';
import { RateLimitGuard } from '../../../platform/security/http/rate-limit.guard';
import { TenantContextInterceptor } from '../../../platform/tenancy/tenant-context.interceptor';
import type { FoundationPipelineOptions } from '../foundation.options';
import {
  FOUNDATION_PIPELINE_ORDER,
  type FoundationPipelineStage,
} from '../foundation.tokens';
import { ActiveRequestInterceptor } from './active-request.interceptor';
import { CorrelationInterceptor } from './correlation.interceptor';
import { TracingInterceptor } from './tracing.interceptor';

export interface PipelineBuildContext {
  readonly securityEnabled: boolean;
  readonly tenancyEnabled: boolean;
  readonly reliabilityEnabled: boolean;
  readonly observabilityEnabled: boolean;
}

/**
 * Builds APP_* providers for the documented Foundation HTTP pipeline.
 * Stages are registered only when explicitly enabled; auth is never silent.
 */
export const buildPipelineProviders = (
  pipeline: FoundationPipelineOptions | undefined,
  context: PipelineBuildContext,
): Provider[] => {
  if (!pipeline) {
    return [];
  }

  assertPipelineOrder(pipeline.order);

  const providers: Provider[] = [];

  if (pipeline.correlation === true) {
    providers.push(CorrelationInterceptor, {
      provide: APP_INTERCEPTOR,
      useExisting: CorrelationInterceptor,
    });
  }

  if (pipeline.validation !== undefined && pipeline.validation !== false) {
    const pipe =
      pipeline.validation === true
        ? new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
          })
        : pipeline.validation;
    providers.push({
      provide: APP_PIPE,
      useValue: pipe,
    });
  }

  if (pipeline.auth === true) {
    if (!context.securityEnabled) {
      throw new Error(
        'FoundationModule: pipeline.auth requires the security capability',
      );
    }
    providers.push({
      provide: APP_GUARD,
      useExisting: AuthGuard,
    });
  }

  if (pipeline.tenant === true) {
    if (!context.tenancyEnabled) {
      throw new Error(
        'FoundationModule: pipeline.tenant requires the tenancy capability',
      );
    }
    providers.push({
      provide: APP_INTERCEPTOR,
      useExisting: TenantContextInterceptor,
    });
  }

  if (pipeline.rateLimit === true) {
    if (!context.securityEnabled) {
      throw new Error(
        'FoundationModule: pipeline.rateLimit requires the security capability',
      );
    }
    providers.push({
      provide: APP_GUARD,
      useExisting: RateLimitGuard,
    });
  }

  if (pipeline.audit !== undefined && pipeline.audit !== false) {
    if (pipeline.audit === true) {
      throw new Error(
        'FoundationModule: pipeline.audit requires an explicit interceptor Type or Provider (do not enable with bare true)',
      );
    }
    if (typeof pipeline.audit === 'function') {
      providers.push(pipeline.audit, {
        provide: APP_INTERCEPTOR,
        useExisting: pipeline.audit,
      });
    } else {
      providers.push(pipeline.audit);
    }
  }

  if (pipeline.tracing === true) {
    if (!context.observabilityEnabled) {
      throw new Error(
        'FoundationModule: pipeline.tracing requires the observability capability',
      );
    }
    providers.push(TracingInterceptor, {
      provide: APP_INTERCEPTOR,
      useExisting: TracingInterceptor,
    });
  }

  if (pipeline.activeRequestTracking === true) {
    if (!context.reliabilityEnabled) {
      throw new Error(
        'FoundationModule: pipeline.activeRequestTracking requires the reliability capability',
      );
    }
    providers.push(ActiveRequestInterceptor, {
      provide: APP_INTERCEPTOR,
      useExisting: ActiveRequestInterceptor,
    });
  }

  return providers;
};

const assertPipelineOrder = (
  order: readonly FoundationPipelineStage[] | undefined,
): void => {
  if (order === undefined) {
    return;
  }
  const expected = new Set<string>(FOUNDATION_PIPELINE_ORDER);
  if (order.length !== FOUNDATION_PIPELINE_ORDER.length) {
    throw new Error(
      `FoundationModule: pipeline.order must list all stages: ${FOUNDATION_PIPELINE_ORDER.join(', ')}`,
    );
  }
  const seen = new Set<string>();
  for (const stage of order) {
    if (!expected.has(stage) || seen.has(stage)) {
      throw new Error(
        `FoundationModule: pipeline.order contains invalid or duplicate stage "${stage}"`,
      );
    }
    seen.add(stage);
  }
};

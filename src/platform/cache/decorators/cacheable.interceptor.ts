import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, map, Observable, of, switchMap } from 'rxjs';
import type { CacheStore } from '../contracts/cache.interface';
import { CACHE_STORE, CACHE_TAG_INDEX } from '../contracts/cache.tokens';
import { CacheInvalidationService } from '../invalidation/cache-invalidation.service';
import { CacheKeyBuilder } from '../strategies/cache-key.builder';
import { TagIndex } from '../strategies/tag-index';
import { TtlStrategy } from '../strategies/ttl.strategy';
import {
  CACHE_EVICT_METADATA,
  CacheEvictOptions,
} from './cache-evict.decorator';
import {
  CACHEABLE_METADATA,
  CacheableOptions,
  CacheKeyResolver,
  CacheTagsResolver,
} from './cacheable.decorator';

@Injectable()
export class CacheableInterceptor implements NestInterceptor {
  public constructor(
    @Inject(CACHE_STORE) private readonly store: CacheStore,
    @Inject(CACHE_TAG_INDEX) private readonly tagIndex: TagIndex,
    private readonly reflector: Reflector,
    private readonly invalidation: CacheInvalidationService,
    private readonly keyBuilder: CacheKeyBuilder,
    private readonly ttlStrategy: TtlStrategy,
  ) {}

  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const cacheable = this.reflector.getAllAndOverride<CacheableOptions>(
      CACHEABLE_METADATA,
      [context.getHandler(), context.getClass()],
    );
    const evict = this.reflector.getAllAndOverride<CacheEvictOptions>(
      CACHE_EVICT_METADATA,
      [context.getHandler(), context.getClass()],
    );
    const args = context.getArgs<unknown[]>();
    const before = evict?.beforeInvocation
      ? this.evict(evict, args)
      : Promise.resolve();

    return from(before).pipe(
      switchMap(() => {
        if (!cacheable) {
          return this.invokeAndEvict(next, evict, args);
        }
        const key = this.resolveKey(cacheable.key, args, context);
        return from(this.store.get<unknown>(key)).pipe(
          switchMap((cached) => {
            if (cached !== undefined) {
              return of(cached);
            }
            return next.handle().pipe(
              switchMap((value: unknown) => {
                const tags = this.resolveTags(cacheable.tags, args);
                return from(
                  this.store
                    .set(key, value, {
                      ttlSeconds: this.ttlStrategy.resolve(cacheable.ttl),
                      tags,
                    })
                    .then(async () => this.tagIndex.add(key, tags)),
                ).pipe(map(() => value));
              }),
            );
          }),
        );
      }),
    );
  }

  private invokeAndEvict(
    next: CallHandler,
    options: CacheEvictOptions | undefined,
    args: unknown[],
  ): Observable<unknown> {
    if (!options || options.beforeInvocation) {
      return next.handle();
    }
    return next
      .handle()
      .pipe(
        switchMap((value: unknown) =>
          from(this.evict(options, args)).pipe(map(() => value)),
        ),
      );
  }

  private async evict(
    options: CacheEvictOptions,
    args: unknown[],
  ): Promise<void> {
    if (options.namespace) {
      await this.invalidation.invalidateNamespace();
      return;
    }
    const key = this.resolveOptional(options.key, args);
    if (key !== undefined) {
      await this.invalidation.invalidateByKey(
        this.keyBuilder.namespaceExplicitKey(key),
      );
    }
    const tags = this.resolveTags(options.tags, args);
    await Promise.all(
      tags.map(async (tag) => this.invalidation.invalidateByTag(tag)),
    );
  }

  private resolveKey(
    resolver: CacheKeyResolver | undefined,
    args: unknown[],
    context: ExecutionContext,
  ): string {
    const explicit = this.resolveOptional(resolver, args);
    return explicit !== undefined
      ? this.keyBuilder.namespaceExplicitKey(explicit)
      : this.keyBuilder.build([
          context.getClass().name,
          context.getHandler().name,
          args,
        ]);
  }

  private resolveOptional(
    resolver: CacheKeyResolver | undefined,
    args: unknown[],
  ): string | undefined {
    return typeof resolver === 'function' ? resolver(...args) : resolver;
  }

  private resolveTags(
    resolver: CacheTagsResolver | undefined,
    args: unknown[],
  ): readonly string[] {
    if (!resolver) {
      return [];
    }
    return typeof resolver === 'function' ? resolver(...args) : resolver;
  }
}

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Prisma Module.
 *
 * Global provider for {@link PrismaService}. Imported automatically by
 * {@link DatabaseModule} when `ORM_TYPE=prisma`.
 *
 * Feature modules can inject PrismaService without re-importing this module:
 *
 * ```typescript
 * @Injectable()
 * export class ResourcesService {
 *   constructor(private readonly prisma: PrismaService) {}
 * }
 * ```
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

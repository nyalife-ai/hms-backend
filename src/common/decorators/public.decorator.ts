import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used by authentication guards to skip JWT verification.
 * Feature modules that add auth should read this key via Reflector.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route or controller as publicly accessible (no authentication).
 *
 * @example
 * ```typescript
 * @Public()
 * @Get('health')
 * getHealth() { ... }
 * ```
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

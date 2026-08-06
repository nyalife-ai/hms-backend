/**
 * Application-facing HTTP interfaces that sit outside feature modules.
 *
 * Controllers here expose cross-cutting, non-domain endpoints (health,
 * metadata, etc.). Feature APIs belong under `src/modules/<domain>/`.
 */
export { PublicController } from './public/public.controller';

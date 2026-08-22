/**
 * Ambient types when @types/multer is not installed.
 * Prefer `yarn add -D @types/multer` in environments that can reach the registry.
 */

declare module 'multer' {
  export function memoryStorage(): unknown;
  const multer: unknown;
  export default multer;
}

export type Environment = 'development' | 'staging' | 'production';

export function resolveEnvironment(
  environment: string | undefined,
): Environment {
  const resolved = environment?.trim().toLowerCase() || 'development';
  if (
    resolved !== 'development' &&
    resolved !== 'staging' &&
    resolved !== 'production'
  ) {
    throw new RangeError(`Unsupported environment "${environment}"`);
  }
  return resolved;
}

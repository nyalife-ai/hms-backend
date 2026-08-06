export type ReadReplicaConfig = Readonly<{
  url?: string;
  fallbackToPrimary?: boolean;
}>;

export const resolveReadReplicaUrl = (
  config: ReadReplicaConfig,
  primaryUrl?: string,
): string | undefined => {
  const replica = config.url?.trim();
  if (replica !== undefined && replica.length > 0) {
    return replica;
  }
  return config.fallbackToPrimary === false ? undefined : primaryUrl;
};

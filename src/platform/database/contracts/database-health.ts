export type DatabaseHealth = Readonly<{
  status: 'up' | 'down';
  latencyMs: number;
  details?: Readonly<Record<string, string | number | boolean>>;
}>;

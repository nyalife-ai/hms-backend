/** Canonical asynchronous secret lookup contract shared across platform layers. */
export interface SecretProvider {
  get(name: string): Promise<string | null>;
}

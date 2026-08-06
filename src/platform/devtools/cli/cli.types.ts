export interface CliCommand {
  readonly name: string;
  readonly description: string;
  run(args: readonly string[]): Promise<number>;
}

export interface CommandRegistry {
  get(name: string): CliCommand | undefined;
  list(): readonly CliCommand[];
}

export interface CliWriter {
  write(message: string): void;
}

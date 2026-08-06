import { CliWriter, CommandRegistry } from './cli.types';

export class CliRunner {
  public constructor(
    private readonly registry: CommandRegistry,
    private readonly writer: CliWriter,
  ) {}

  public async run(argv: readonly string[]): Promise<number> {
    const [name, ...args] = argv;
    if (name === undefined || name === 'help' || name === '--help') {
      this.writeHelp();
      return 0;
    }
    const command = this.registry.get(name);
    if (command === undefined) {
      this.writer.write(`Unknown command: ${name}`);
      this.writeHelp();
      return 1;
    }
    return command.run(args);
  }

  private writeHelp(): void {
    this.writer.write('Available commands:');
    for (const command of this.registry.list()) {
      this.writer.write(`  ${command.name} - ${command.description}`);
    }
  }
}

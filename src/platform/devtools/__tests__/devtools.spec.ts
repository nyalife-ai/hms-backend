import * as devtools from '../index';
import { CheckRunner } from '../check-runner';
import { CliRunner } from '../cli/cli-runner';
import { CliCommand, CliWriter, CommandRegistry } from '../cli/cli.types';
import { DtoGenerator } from '../generators/dto.generator';
import { FileWriter, GeneratedFile } from '../generators/generator.types';
import { ModuleGenerator } from '../generators/module.generator';
import { RepositoryGenerator } from '../generators/repository.generator';
import { ServiceGenerator } from '../generators/service.generator';
import { TemplateEngine } from '../generators/template-engine';
import {
  buildDockerComposeConfig,
  serializeYaml,
} from '../local-dev/docker-compose.config';
import { MODULE_TEMPLATE } from '../templates/templates';

class MemoryWriter implements FileWriter {
  public readonly files: GeneratedFile[] = [];

  public async write(file: GeneratedFile): Promise<void> {
    this.files.push(file);
  }
}

describe('devtools platform', () => {
  it('dispatches CLI commands and passes remaining arguments', async () => {
    const output: string[] = [];
    const command: CliCommand = {
      name: 'generate',
      description: 'Generate a scaffold',
      run: async (args): Promise<number> => {
        expect(args).toEqual(['service', 'users']);
        return 7;
      },
    };
    const registry: CommandRegistry = {
      get: (name): CliCommand | undefined =>
        name === command.name ? command : undefined,
      list: (): readonly CliCommand[] => [command],
    };
    const writer: CliWriter = {
      write: (message): void => void output.push(message),
    };
    const runner = new CliRunner(registry, writer);
    await expect(runner.run(['generate', 'service', 'users'])).resolves.toBe(7);
    await expect(runner.run(['missing'])).resolves.toBe(1);
    expect(output).toContain('Unknown command: missing');
  });

  it('prints help for empty, help, and help-flag invocations', async () => {
    const output: string[] = [];
    const registry: CommandRegistry = {
      get: (): CliCommand | undefined => undefined,
      list: (): readonly CliCommand[] => [],
    };
    const runner = new CliRunner(registry, {
      write: (message): void => void output.push(message),
    });
    await expect(runner.run([])).resolves.toBe(0);
    await expect(runner.run(['help'])).resolves.toBe(0);
    await expect(runner.run(['--help'])).resolves.toBe(0);
    expect(output).toEqual([
      'Available commands:',
      'Available commands:',
      'Available commands:',
    ]);
  });

  it('interpolates escaped and raw template values', () => {
    const engine = new TemplateEngine();
    expect(
      engine.render('{{value}} {{{value}}}', {
        value: `<tag attr="'">&`,
      }),
    ).toBe('&lt;tag attr=&quot;&#39;&quot;&gt;&amp; <tag attr="\'">&');
    expect(() => engine.render('{{missing}}', {})).toThrow(
      'Missing template variable: missing',
    );
  });

  it('generates and writes module scaffolds', async () => {
    const writer = new MemoryWriter();
    const generator = new ModuleGenerator(writer);
    const generated = generator.generate({ name: 'user_profile' });
    expect(generated.map((file): string => file.path)).toEqual([
      'user_profile/user_profile.module.ts',
      'user_profile/user_profile.controller.ts',
      'user_profile/user_profile.controller.spec.ts',
      'user_profile/README.md',
    ]);
    expect(generated[0].contents).toContain('UserProfileModule');
    const written = await generator.write({
      name: 'admin-user',
      directory: 'src/admin',
    });
    expect(written[1].contents).toContain("Controller('admin-user')");
    expect(writer.files).toHaveLength(4);
  });

  it('generates and writes service scaffolds', async () => {
    const writer = new MemoryWriter();
    const generator = new ServiceGenerator(writer);
    expect(generator.generate({ name: 'mail_queue' })[0].contents).toContain(
      'MailQueueService',
    );
    const files = await generator.write({
      name: 'mail-queue',
      directory: 'custom',
    });
    expect(files.map((file): string => file.path)).toEqual([
      'custom/mail-queue.service.ts',
      'custom/mail-queue.service.spec.ts',
    ]);
    expect(writer.files).toHaveLength(2);
  });

  it('generates and writes repository scaffolds', async () => {
    const writer = new MemoryWriter();
    const generator = new RepositoryGenerator(writer);
    expect(generator.generate({ name: 'audit_log' })[0].contents).toContain(
      'AuditLogRepository',
    );
    const files = await generator.write({
      name: 'audit-log',
      directory: 'domain',
    });
    expect(files[1].path).toBe('domain/audit-log.repository.md');
    expect(writer.files).toHaveLength(2);
  });

  it('generates and writes DTO scaffolds', async () => {
    const writer = new MemoryWriter();
    const generator = new DtoGenerator(writer);
    expect(generator.generate({ name: 'create_user' })[0].contents).toContain(
      'CreateUserDto',
    );
    const files = await generator.write({
      name: 'create-user',
      directory: 'dto',
    });
    expect(files[1].path).toBe('dto/create-user.dto.spec.ts');
    expect(writer.files).toHaveLength(2);
  });

  it('aggregates successful, failed, and throwing checks', async () => {
    const report = await new CheckRunner([
      { name: 'lint', run: async (): Promise<boolean> => true },
      { name: 'types', run: async (): Promise<boolean> => false },
      {
        name: 'tests',
        run: async (): Promise<boolean> => {
          throw new Error('test process failed');
        },
      },
      {
        name: 'format',
        run: async (): Promise<boolean> => {
          throw 'format process failed';
        },
      },
    ]).run();
    expect(report.passed).toBe(false);
    expect(report.results).toEqual([
      { name: 'lint', passed: true },
      { name: 'types', passed: false, message: 'Check returned failure' },
      { name: 'tests', passed: false, message: 'test process failed' },
      { name: 'format', passed: false, message: 'format process failed' },
    ]);
    await expect(
      new CheckRunner([
        { name: 'lint', run: async (): Promise<boolean> => true },
      ]).run(),
    ).resolves.toEqual({
      passed: true,
      results: [{ name: 'lint', passed: true }],
    });
  });

  it('builds and serializes local docker-compose configuration', () => {
    const config = buildDockerComposeConfig();
    expect(Object.keys(config.services)).toEqual([
      'postgres',
      'redis',
      'broker',
      'prometheus',
      'grafana',
    ]);
    const yaml = serializeYaml(config);
    expect(yaml).toContain('postgres:');
    expect(yaml).toContain('image: "postgres:16-alpine"');
    expect(yaml).toContain('- "5432:5432"');
  });

  it('serializes every supported minimal YAML shape', () => {
    expect(serializeYaml(null)).toBe('null\n');
    expect(serializeYaml(true)).toBe('true\n');
    expect(serializeYaml(3)).toBe('3\n');
    expect(serializeYaml('text')).toBe('"text"\n');
    expect(serializeYaml([])).toBe('[]\n');
    expect(serializeYaml({})).toBe('{}\n');
    expect(serializeYaml([{ nested: ['value'] }, []])).toBe(
      '- nested:\n    - "value"\n- []\n',
    );
  });

  it('exports the public devtools surface and templates', () => {
    expect(devtools.CliRunner).toBe(CliRunner);
    expect(devtools.ModuleGenerator).toBe(ModuleGenerator);
    expect(MODULE_TEMPLATE).toContain('@Module');
  });
});

import { SERVICE_TEMPLATE, SPEC_TEMPLATE } from '../templates/templates';
import { FileWriter, GeneratedFile, GeneratorOptions } from './generator.types';
import { TemplateEngine } from './template-engine';

export class ServiceGenerator {
  public constructor(
    private readonly writer: FileWriter,
    private readonly templates: TemplateEngine = new TemplateEngine(),
  ) {}

  public generate(options: GeneratorOptions): GeneratedFile[] {
    const directory = options.directory ?? options.name;
    const className = this.classify(options.name);
    const variables = { className, kebabName: options.name };
    return [
      {
        path: `${directory}/${options.name}.service.ts`,
        contents: this.templates.render(SERVICE_TEMPLATE, variables),
      },
      {
        path: `${directory}/${options.name}.service.spec.ts`,
        contents: this.templates.render(SPEC_TEMPLATE, variables),
      },
    ];
  }

  public async write(options: GeneratorOptions): Promise<GeneratedFile[]> {
    const files = this.generate(options);
    await Promise.all(
      files.map(async (file): Promise<void> => this.writer.write(file)),
    );
    return files;
  }

  private classify(name: string): string {
    return name
      .split(/[-_]/)
      .map((part): string => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }
}

import { FileWriter, GeneratedFile, GeneratorOptions } from './generator.types';
import { TemplateEngine } from './template-engine';
import {
  CONTROLLER_TEMPLATE,
  DOC_TEMPLATE,
  MODULE_TEMPLATE,
  SPEC_TEMPLATE,
} from '../templates/templates';

export class ModuleGenerator {
  public constructor(
    private readonly writer: FileWriter,
    private readonly templates: TemplateEngine = new TemplateEngine(),
  ) {}

  public generate(options: GeneratorOptions): GeneratedFile[] {
    const directory = options.directory ?? options.name;
    const className = this.classify(options.name);
    const variables = {
      className,
      kebabName: options.name,
      route: options.name,
    };
    return [
      {
        path: `${directory}/${options.name}.module.ts`,
        contents: this.templates.render(MODULE_TEMPLATE, variables),
      },
      {
        path: `${directory}/${options.name}.controller.ts`,
        contents: this.templates.render(CONTROLLER_TEMPLATE, variables),
      },
      {
        path: `${directory}/${options.name}.controller.spec.ts`,
        contents: this.templates.render(SPEC_TEMPLATE, variables),
      },
      {
        path: `${directory}/README.md`,
        contents: this.templates.render(DOC_TEMPLATE, variables),
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

export const MODULE_TEMPLATE =
  "import { Module } from '@nestjs/common';\n\n@Module({})\nexport class {{{className}}}Module {}\n";

export const CONTROLLER_TEMPLATE =
  "import { Controller } from '@nestjs/common';\n\n@Controller('{{{route}}}')\nexport class {{{className}}}Controller {}\n";

export const SERVICE_TEMPLATE =
  "import { Injectable } from '@nestjs/common';\n\n@Injectable()\nexport class {{{className}}}Service {}\n";

export const REPOSITORY_TEMPLATE =
  "export interface {{{className}}}Repository {\n  readonly name: '{{{kebabName}}}';\n}\n";

export const DTO_TEMPLATE =
  'export class {{{className}}}Dto {\n  public readonly value!: string;\n}\n';

export const SPEC_TEMPLATE =
  "describe('{{{className}}}', () => {\n  it('is defined', () => {\n    expect({{{className}}}).toBeDefined();\n  });\n});\n";

export const DOC_TEMPLATE =
  '# {{{className}}}\n\nGenerated scaffold for the `{{{kebabName}}}` component.\n';

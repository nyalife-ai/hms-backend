export interface GeneratedFile {
  readonly path: string;
  readonly contents: string;
}

export interface FileWriter {
  write(file: GeneratedFile): Promise<void>;
}

export interface GeneratorOptions {
  readonly name: string;
  readonly directory?: string;
}

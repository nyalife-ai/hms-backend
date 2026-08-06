export interface OpenApiConfig {
  readonly openapi: '3.0.0';
  readonly info: Readonly<{
    title: string;
    version: string;
    description?: string;
  }>;
  readonly components: Readonly<{
    securitySchemes: Readonly<
      Record<string, Readonly<Record<string, unknown>>>
    >;
    schemas: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
    responses: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  }>;
}

export class OpenApiConfigBuilder {
  private title = 'API';
  private version = '1.0.0';
  private description?: string;
  private readonly securitySchemes: Record<
    string,
    Readonly<Record<string, unknown>>
  > = {};
  private readonly responses: Record<
    string,
    Readonly<Record<string, unknown>>
  > = {};

  public setTitle(title: string): this {
    this.title = title;
    return this;
  }

  public setVersion(version: string): this {
    this.version = version;
    return this;
  }

  public setDescription(description: string): this {
    this.description = description;
    return this;
  }

  public addSecurityScheme(
    name: string,
    scheme: Readonly<Record<string, unknown>>,
  ): this {
    this.securitySchemes[name] = scheme;
    return this;
  }

  public addCommonResponse(
    name: string,
    response: Readonly<Record<string, unknown>>,
  ): this {
    this.responses[name] = response;
    return this;
  }

  public build(): OpenApiConfig {
    const errorSchema = {
      type: 'object',
      required: ['success', 'error', 'timestamp'],
      properties: {
        success: { type: 'boolean', enum: [false] },
        error: {
          type: 'object',
          required: ['code', 'message'],
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: {},
          },
        },
        timestamp: { type: 'string', format: 'date-time' },
      },
    } as const;
    const paginationSchema = {
      type: 'object',
      required: ['items', 'total'],
      properties: {
        items: { type: 'array', items: {} },
        total: { type: 'integer', minimum: 0 },
        page: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1 },
        nextCursor: { type: 'string' },
      },
    } as const;
    return {
      openapi: '3.0.0',
      info: {
        title: this.title,
        version: this.version,
        ...(this.description === undefined
          ? {}
          : { description: this.description }),
      },
      components: {
        securitySchemes: { ...this.securitySchemes },
        schemas: { Error: errorSchema, Pagination: paginationSchema },
        responses: { ...this.responses },
      },
    };
  }
}

export interface CheckResult {
  readonly name: string;
  readonly passed: boolean;
  readonly message?: string;
}

export interface CheckReport {
  readonly passed: boolean;
  readonly results: readonly CheckResult[];
}

export interface RegisteredCheck {
  readonly name: string;
  readonly run: () => Promise<boolean>;
}

export class CheckRunner {
  public constructor(private readonly checks: readonly RegisteredCheck[]) {}

  public async run(): Promise<CheckReport> {
    const results = await Promise.all(
      this.checks.map(async (check): Promise<CheckResult> => {
        try {
          const passed = await check.run();
          return {
            name: check.name,
            passed,
            ...(passed ? {} : { message: 'Check returned failure' }),
          };
        } catch (error: unknown) {
          return {
            name: check.name,
            passed: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
    return {
      passed: results.every((result): boolean => result.passed),
      results,
    };
  }
}

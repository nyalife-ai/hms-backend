export type OrmProvider = 'prisma' | 'typeorm';

export type OrmEnvironment = Readonly<
  Partial<Record<'ORM_PROVIDER' | 'ORM_TYPE', string | undefined>>
>;

/** Resolves ORM_PROVIDER first, retaining ORM_TYPE as a compatibility fallback. */
export const resolveOrmProvider = (
  env: OrmEnvironment = process.env,
): OrmProvider => {
  const candidate = (env.ORM_PROVIDER ?? env.ORM_TYPE ?? 'prisma')
    .trim()
    .toLowerCase();
  if (candidate === 'prisma' || candidate === 'typeorm') {
    return candidate;
  }
  throw new Error(
    `Unsupported ORM provider "${candidate}"; expected "prisma" or "typeorm"`,
  );
};

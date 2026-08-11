/**
 * Seed laboratory test types + billable clinical services from
 * prisma/data/lab_test_types.csv (NyaLife price list export).
 */
import * as fs from 'fs';
import * as path from 'path';
import { Prisma, type PrismaClient } from '../src/generated/prisma';

const LAB_CATEGORIES = new Set([
  'Hematology',
  'Chemistry',
  'Microbiology',
  'Parasitology',
  'Biochemistry',
  'Serology',
  'Pathology',
  'Reproductive',
  'Laboratory',
]);

type CsvRow = {
  test_type_id: string;
  test_name: string;
  description: string;
  category: string;
  price: string;
  normal_range: string;
  units: string;
  template: string;
  is_active: string;
};

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

function nullish(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (!t || t.toUpperCase() === 'NULL') return null;
  return t;
}

function parseCsv(filePath: string): CsvRow[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, ''));
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]).map((c) => c.replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ?? '';
    });
    rows.push(obj as CsvRow);
  }
  return rows;
}

/** Minimal CSV splitter that respects quoted commas / escaped quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseTemplate(raw: string | null): Array<{
  label: string;
  unit: string;
  normalRange: string;
}> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{
      label?: string;
      unit?: string;
      normalRange?: string;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => ({
      label: String(p.label ?? '').trim() || 'Parameter',
      unit: String(p.unit ?? '').trim(),
      normalRange: String(p.normalRange ?? '').trim(),
    }));
  } catch {
    return [];
  }
}

function extractServiceCode(description: string | null, fallback: string): string {
  if (description) {
    const m = description.match(/Code:\s*([A-Za-z0-9._-]+)/i);
    if (m?.[1] && m[1] !== '.') {
      return m[1].toUpperCase().slice(0, 50);
    }
  }
  return fallback.slice(0, 50);
}

function isLabRow(row: CsvRow): boolean {
  const cat = nullish(row.category) ?? '';
  if (LAB_CATEGORIES.has(cat)) return true;
  const tmpl = nullish(row.template);
  return Boolean(tmpl);
}

async function ensureTestCategory(
  prisma: PrismaClient,
  name: string,
  cache: Map<string, string>,
): Promise<string> {
  const key = name.trim();
  const hit = cache.get(key.toLowerCase());
  if (hit) return hit;
  const slug = slugify(key) || 'general';
  const row = await prisma.testCategories.upsert({
    where: { name: key },
    create: { name: key, slug, is_active: true },
    update: { slug, is_active: true },
  });
  cache.set(key.toLowerCase(), row.id);
  return row.id;
}

async function ensureServiceCategory(
  prisma: PrismaClient,
  name: string,
  cache: Map<string, string>,
): Promise<string> {
  const key = name.trim();
  const hit = cache.get(key.toLowerCase());
  if (hit) return hit;
  const slug = slugify(key) || 'general';
  const row = await prisma.serviceCategories.upsert({
    where: { name: key },
    create: { name: key, slug, is_active: true },
    update: { slug, is_active: true },
  });
  cache.set(key.toLowerCase(), row.id);
  return row.id;
}

export async function seedLabCatalog(prisma: PrismaClient): Promise<void> {
  const csvPath = path.join(__dirname, 'data', 'lab_test_types.csv');
  if (!fs.existsSync(csvPath)) {
    console.warn(`Lab catalog CSV missing at ${csvPath} — skipping`);
    return;
  }

  const rows = parseCsv(csvPath);
  const testCatCache = new Map<string, string>();
  const svcCatCache = new Map<string, string>();
  let labCount = 0;
  let svcCount = 0;
  let paramCount = 0;

  for (const row of rows) {
    const name = nullish(row.test_name);
    if (!name) continue;
    const category = nullish(row.category) ?? 'General';
    const description = nullish(row.description);
    const units = nullish(row.units);
    const normalRange = nullish(row.normal_range);
    const templateRaw = nullish(row.template);
    const template = parseTemplate(templateRaw);
    const price = Number(row.price) || 0;
    const isActive = row.is_active === '1' || row.is_active?.toLowerCase() === 'true';

    if (isLabRow(row)) {
      const categoryId = await ensureTestCategory(prisma, category, testCatCache);
      const type = await prisma.testTypes.upsert({
        where: { test_name: name },
        create: {
          test_name: name,
          category,
          category_id: categoryId,
          description,
          units,
          normal_range: normalRange,
          template: templateRaw
            ? (template as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          standard_price: price,
          is_active: isActive,
        },
        update: {
          category,
          category_id: categoryId,
          description,
          units,
          normal_range: normalRange,
          template: templateRaw
            ? (template as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          standard_price: price,
          is_active: isActive,
        },
      });
      labCount += 1;

      if (template.length) {
        const existing = await prisma.testParameters.findMany({
          where: { test_type_id: type.id },
          select: { parameter_name: true },
        });
        const have = new Set(existing.map((p) => p.parameter_name.toLowerCase()));
        let order = existing.length;
        for (const p of template) {
          if (have.has(p.label.toLowerCase())) continue;
          await prisma.testParameters.create({
            data: {
              test_type_id: type.id,
              parameter_name: p.label.slice(0, 100),
              unit_of_measurement: p.unit ? p.unit.slice(0, 30) : null,
              normal_reference_range: p.normalRange
                ? p.normalRange.slice(0, 100)
                : null,
              display_order: order++,
              is_active: true,
            },
          });
          paramCount += 1;
          have.add(p.label.toLowerCase());
        }
      } else if (units || normalRange) {
        const existing = await prisma.testParameters.count({
          where: { test_type_id: type.id },
        });
        if (existing === 0) {
          await prisma.testParameters.create({
            data: {
              test_type_id: type.id,
              parameter_name: name.slice(0, 100),
              unit_of_measurement: units ? units.slice(0, 30) : null,
              normal_reference_range: normalRange
                ? normalRange.slice(0, 100)
                : null,
              display_order: 0,
              is_active: true,
            },
          });
          paramCount += 1;
        }
      }
      continue;
    }

    // Clinical / billable services & procedures
    const categoryId = await ensureServiceCategory(
      prisma,
      category,
      svcCatCache,
    );
    const code = extractServiceCode(
      description,
      `CLIN-${String(row.test_type_id).padStart(4, '0')}`,
    );
    try {
      await prisma.services.upsert({
        where: { service_code: code },
        create: {
          service_code: code,
          service_name: name,
          category,
          category_id: categoryId,
          description,
          standard_price: price,
          is_active: isActive,
        },
        update: {
          service_name: name,
          category,
          category_id: categoryId,
          description,
          standard_price: price,
          is_active: isActive,
        },
      });
      svcCount += 1;
    } catch (err) {
      // Collision on odd codes — fall back to unique synthetic code
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const alt = `CLIN-${String(row.test_type_id).padStart(4, '0')}`;
        await prisma.services.upsert({
          where: { service_code: alt },
          create: {
            service_code: alt,
            service_name: name,
            category,
            category_id: categoryId,
            description,
            standard_price: price,
            is_active: isActive,
          },
          update: {
            service_name: name,
            category,
            category_id: categoryId,
            description,
            standard_price: price,
            is_active: isActive,
          },
        });
        svcCount += 1;
      } else {
        throw err;
      }
    }
  }

  console.log(
    `Lab catalog seed: ${labCount} test types, ${paramCount} parameters, ${svcCount} clinical services`,
  );
}

/**
 * Converts CREATE TABLE statements in db.sql / migration.sql into a Prisma
 * multi-schema schema.prisma. Not a full SQL parser — tuned for NyaLife's
 * db.sql style (typed columns, CHECK constraints, simple FKs).
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sqlPath = path.join(
  root,
  "prisma/migrations/20260803120000_init_hms/migration.sql",
);
const outPath = path.join(root, "prisma/schema.prisma");

const sql = fs.readFileSync(sqlPath, "utf8");

const SCHEMAS = [
  "core",
  "patients",
  "clinical",
  "inpatient",
  "pharmacy",
  "laboratory",
  "radiology",
  "billing",
  "communications",
];

function pascal(name) {
  return name
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

function mapType(col) {
  const t = col.toLowerCase();
  if (t.includes("uuid")) return "String @db.Uuid";
  if (t.includes("timestamptz") || t.includes("timestamp")) return "DateTime @db.Timestamptz(6)";
  if (t.startsWith("date")) return "DateTime @db.Date";
  if (t.startsWith("time")) return "DateTime @db.Time(6)";
  if (t.includes("boolean") || t.includes("bool")) return "Boolean";
  if (t.includes("numeric") || t.includes("decimal")) {
    const m = t.match(/numeric\((\d+),\s*(\d+)\)/);
    if (m) return `Decimal @db.Decimal(${m[1]}, ${m[2]})`;
    return "Decimal";
  }
  if (t.includes("bigint")) return "BigInt";
  if (t.includes("double") || t.includes("float") || t.includes("real")) return "Float";
  if (t.includes("int")) return "Int";
  if (t.includes("jsonb") || t.includes("json")) return "Json";
  if (t.includes("text")) return "String";
  const vm = t.match(/varchar\((\d+)\)/);
  if (vm) return `String @db.VarChar(${vm[1]})`;
  if (t.includes("character varying") || t.includes("varchar")) return "String";
  return "String";
}

const tableRe =
  /CREATE TABLE\s+([a-z_]+)\.([a-z_0-9]+)\s*\(([\s\S]*?)\);/gi;

const tables = [];
let match;
while ((match = tableRe.exec(sql)) !== null) {
  const [, schema, table, body] = match;
  tables.push({ schema, table, body });
}

/** @type {Map<string, {schema:string, table:string, model:string}>} */
const byKey = new Map();
for (const t of tables) {
  byKey.set(`${t.schema}.${t.table}`, {
    ...t,
    model: pascal(t.table === "users" && t.schema === "core" ? "User" : t.table),
  });
}

// Disambiguate duplicate table names across schemas
const nameCount = new Map();
for (const t of byKey.values()) {
  nameCount.set(t.model, (nameCount.get(t.model) || 0) + 1);
}
for (const t of byKey.values()) {
  if (nameCount.get(t.model) > 1) {
    t.model = pascal(t.schema) + pascal(t.table);
  }
}

function parseColumns(body, schema, table) {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("--"));

  const cols = [];
  const pks = [];
  const uniques = [];
  const fks = [];

  for (const line of lines) {
    const cleaned = line.replace(/,\s*$/, "");

    if (/^PRIMARY KEY\s*\(/i.test(cleaned)) {
      const m = cleaned.match(/\(([^)]+)\)/);
      if (m) pks.push(...m[1].split(",").map((s) => s.trim()));
      continue;
    }
    if (/^UNIQUE\s*\(/i.test(cleaned)) {
      const m = cleaned.match(/\(([^)]+)\)/);
      if (m) uniques.push(m[1].split(",").map((s) => s.trim()));
      continue;
    }
    if (/^CONSTRAINT|^CHECK|^FOREIGN KEY/i.test(cleaned)) {
      const fk = cleaned.match(
        /FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+([a-z_]+)\.([a-z_0-9]+)\s*\(([^)]+)\)(?:\s*ON DELETE\s+([A-Z ]+))?/i,
      );
      if (fk) {
        fks.push({
          col: fk[1].trim(),
          refSchema: fk[2],
          refTable: fk[3],
          refCol: fk[4].trim(),
          onDelete: (fk[5] || "").trim(),
        });
      }
      continue;
    }

    const colMatch = cleaned.match(
      /^([a-z_][a-z0-9_]*)\s+([A-Z0-9(),\s]+?)(?:\s+(.+))?$/i,
    );
    if (!colMatch) continue;
    const [, name, typeRaw, rest = ""] = colMatch;
    if (["PRIMARY", "UNIQUE", "CONSTRAINT", "CHECK", "FOREIGN"].includes(name.toUpperCase())) {
      continue;
    }

    const typePart = `${typeRaw} ${rest}`.trim();
    const isPk = /PRIMARY KEY/i.test(typePart);
    const isUnique = /\bUNIQUE\b/i.test(typePart);
    const isOptional = !/\bNOT NULL\b/i.test(typePart) && !isPk;
    const hasDefaultUuid = /gen_random_uuid\(\)/i.test(typePart);
    const hasDefaultNow = /DEFAULT\s+NOW\(\)/i.test(typePart);
    const hasDefaultTrue = /DEFAULT\s+TRUE/i.test(typePart);
    const hasDefaultFalse = /DEFAULT\s+FALSE/i.test(typePart);
    const defaultNum = typePart.match(/DEFAULT\s+(-?\d+(?:\.\d+)?)/i);
    const defaultStr = typePart.match(/DEFAULT\s+'([^']*)'/i);

    const inlineFk = typePart.match(
      /REFERENCES\s+([a-z_]+)\.([a-z_0-9]+)\s*\(([^)]+)\)(?:\s*ON DELETE\s+([A-Z ]+))?/i,
    );
    if (inlineFk) {
      fks.push({
        col: name,
        refSchema: inlineFk[1],
        refTable: inlineFk[2],
        refCol: inlineFk[3].trim(),
        onDelete: (inlineFk[4] || "").trim(),
      });
    }

    if (isPk) pks.push(name);
    if (isUnique) uniques.push([name]);

    cols.push({
      name,
      prismaType: mapType(typeRaw),
      isOptional,
      isPk,
      hasDefaultUuid,
      hasDefaultNow,
      hasDefaultTrue,
      hasDefaultFalse,
      defaultNum: defaultNum?.[1],
      defaultStr: defaultStr?.[1],
    });
  }

  // Composite PKs from PRIMARY KEY (...) already collected
  return { cols, pks: [...new Set(pks)], uniques, fks };
}

function onDeleteMap(od) {
  if (!od) return "";
  const u = od.toUpperCase();
  if (u.includes("CASCADE")) return " @relation(fields: [FIELD], references: [REF], onDelete: Cascade)";
  if (u.includes("SET NULL")) return " @relation(fields: [FIELD], references: [REF], onDelete: SetNull)";
  return " @relation(fields: [FIELD], references: [REF])";
}

const modelBlocks = [];
const relationNames = new Map(); // avoid duplicate relation names

function relName(fromModel, toModel, field) {
  const base = `${fromModel}_${toModel}_${field}`;
  let n = base;
  let i = 2;
  while (relationNames.has(n)) {
    n = `${base}_${i++}`;
  }
  relationNames.set(n, true);
  return n;
}

for (const meta of byKey.values()) {
  const { cols, pks, uniques, fks } = parseColumns(
    meta.body,
    meta.schema,
    meta.table,
  );
  const lines = [];
  lines.push(`model ${meta.model} {`);

  const compositePk = pks.length > 1;

  for (const col of cols) {
    const isId = !compositePk && pks.includes(col.name);
    let field = `  ${col.name} ${col.prismaType}`;
    if (col.isOptional && !isId) field += "?";
    if (isId) field += " @id";
    if (col.hasDefaultUuid) field += " @default(uuid())";
    else if (col.hasDefaultNow) field += " @default(now())";
    else if (col.hasDefaultTrue) field += " @default(true)";
    else if (col.hasDefaultFalse) field += " @default(false)";
    else if (col.defaultNum !== undefined) field += ` @default(${col.defaultNum})`;
    else if (col.defaultStr !== undefined) field += ` @default("${col.defaultStr}")`;
    if (!compositePk && uniques.some((u) => u.length === 1 && u[0] === col.name) && !isId) {
      field += " @unique";
    }
    // updated_at convention
    if (col.name === "updated_at" && col.hasDefaultNow) {
      field = field.replace(" @default(now())", " @updatedAt");
    }
    lines.push(field);
  }

  // Relations (forward only — Prisma needs both sides; we'll add back-relations lightly)
  for (const fk of fks) {
    const target = byKey.get(`${fk.refSchema}.${fk.refTable}`);
    if (!target) continue;
    const rn = relName(meta.model, target.model, fk.col);
    const od = fk.onDelete.toUpperCase();
    let relAttrs = `fields: [${fk.col}], references: [${fk.refCol}], name: "${rn}"`;
    if (od.includes("CASCADE")) relAttrs += ", onDelete: Cascade";
    else if (od.includes("SET NULL")) relAttrs += ", onDelete: SetNull";
    // Field optionality: if FK column is optional
    const col = cols.find((c) => c.name === fk.col);
    const opt = col?.isOptional ? "?" : "";
    lines.push(`  ${fk.col.replace(/_id$/, "") || target.table} ${target.model}${opt} @relation(${relAttrs})`);
  }

  if (compositePk) {
    lines.push(`  @@id([${pks.join(", ")}])`);
  }
  for (const u of uniques) {
    if (u.length > 1) lines.push(`  @@unique([${u.join(", ")}])`);
  }
  lines.push(`  @@map("${meta.table}")`);
  lines.push(`  @@schema("${meta.schema}")`);
  lines.push(`}`);
  modelBlocks.push(lines.join("\n"));
}

// Add opposite relation stubs — Prisma requires them. Collect needed back-relations.
const back = new Map(); // model -> Set of lines
for (const meta of byKey.values()) {
  const { fks } = parseColumns(meta.body, meta.schema, meta.table);
  for (const fk of fks) {
    const target = byKey.get(`${fk.refSchema}.${fk.refTable}`);
    if (!target) continue;
    const rn = `${meta.model}_${target.model}_${fk.col}`;
    // We used possibly suffixed names above — rebuild the same way
  }
}

// Simpler approach: second pass rebuild with consistent relation names stored
const fkIndex = [];
relationNames.clear();
for (const meta of byKey.values()) {
  const parsed = parseColumns(meta.body, meta.schema, meta.table);
  for (const fk of parsed.fks) {
    const target = byKey.get(`${fk.refSchema}.${fk.refTable}`);
    if (!target) continue;
    const rn = relName(meta.model, target.model, fk.col);
    fkIndex.push({ from: meta, to: target, fk, rn, parsed });
  }
}

const modelFks = new Map();
for (const item of fkIndex) {
  if (!modelFks.has(item.from.model)) modelFks.set(item.from.model, []);
  modelFks.get(item.from.model).push(item);
}
const backRels = new Map();
for (const item of fkIndex) {
  if (!backRels.has(item.to.model)) backRels.set(item.to.model, []);
  // Include FK column so multiple FKs from the same table don't collide
  // e.g. user_roles_user_id vs user_roles_granted_by
  backRels.get(item.to.model).push({
    field: `${item.from.schema}_${item.from.table}_${item.fk.col}`,
    type: item.from.model,
    rn: item.rn,
  });
}

modelBlocks.length = 0;
for (const meta of byKey.values()) {
  const { cols, pks, uniques } = parseColumns(meta.body, meta.schema, meta.table);
  const lines = [];
  lines.push(`model ${meta.model} {`);
  const compositePk = pks.length > 1;

  for (const col of cols) {
    const isId = !compositePk && pks.includes(col.name);
    // Prisma optional marker goes on the type: String? @db.VarChar(255)
    const [baseType, ...attrs] = col.prismaType.split(" ");
    const optional = col.isOptional && !isId ? "?" : "";
    let field = `  ${col.name} ${baseType}${optional}`;
    if (attrs.length) field += ` ${attrs.join(" ")}`;
    if (isId) field += " @id";
    if (col.name === "updated_at") field += " @updatedAt";
    else if (col.hasDefaultUuid) field += " @default(uuid())";
    else if (col.hasDefaultNow) field += " @default(now())";
    else if (col.hasDefaultTrue) field += " @default(true)";
    else if (col.hasDefaultFalse) field += " @default(false)";
    else if (col.defaultNum !== undefined) field += ` @default(${col.defaultNum})`;
    else if (col.defaultStr !== undefined) field += ` @default("${col.defaultStr}")`;
    if (!compositePk && uniques.some((u) => u.length === 1 && u[0] === col.name) && !isId) {
      field += " @unique";
    }
    lines.push(field);
  }

  for (const item of modelFks.get(meta.model) || []) {
    const col = cols.find((c) => c.name === item.fk.col);
    const opt = col?.isOptional ? "?" : "";
    let fieldName = item.fk.col.replace(/_id$/, "");
    if (!fieldName || fieldName === item.fk.col) fieldName = `rel_${item.fk.col}`;
    // avoid clashing with column name
    if (cols.some((c) => c.name === fieldName)) fieldName = `${fieldName}_rel`;
    let attrs = `fields: [${item.fk.col}], references: [${item.fk.refCol}], name: "${item.rn}"`;
    const od = item.fk.onDelete.toUpperCase();
    if (od.includes("CASCADE")) attrs += ", onDelete: Cascade";
    else if (od.includes("SET NULL")) attrs += ", onDelete: SetNull";
    lines.push(`  ${fieldName} ${item.to.model}${opt} @relation(${attrs})`);
  }

  for (const br of backRels.get(meta.model) || []) {
    lines.push(`  ${br.field} ${br.type}[] @relation(name: "${br.rn}")`);
  }

  if (compositePk) lines.push(`  @@id([${pks.join(", ")}])`);
  for (const u of uniques) {
    if (u.length > 1) lines.push(`  @@unique([${u.join(", ")}])`);
  }
  lines.push(`  @@map("${meta.table}")`);
  lines.push(`  @@schema("${meta.schema}")`);
  lines.push(`}`);
  modelBlocks.push(lines.join("\n"));
}

const header = `// ============================================================================
// NyaLife HMS — Prisma schema (multi-schema PostgreSQL / Supabase)
// ============================================================================
// Generated from prisma/migrations/20260803120000_init_hms/migration.sql
// Regenerate: node scripts/sql-to-prisma.mjs
//
// Supabase connection:
//   DATABASE_URL  = Transaction pooler (port 6543) + ?pgbouncer=true
//   DIRECT_URL    = Direct/session connection (port 5432) for migrations
// ============================================================================

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
  output          = "../src/generated/prisma"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  schemas   = [${SCHEMAS.map((s) => `"${s}"`).join(", ")}]
}

`;

fs.writeFileSync(outPath, header + modelBlocks.join("\n\n") + "\n");
console.log(`Wrote ${modelBlocks.length} models to ${outPath}`);

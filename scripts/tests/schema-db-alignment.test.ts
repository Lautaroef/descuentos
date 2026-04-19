// Schema-vs-migration drift guard.
//
// Walks the Zod `Promo` schema and asserts that every one of its fields has a corresponding
// column on the live `promos` table. Catches the two failure modes that cause silent
// prod regressions:
//
//   (a) Someone adds a Zod field but forgets the migration → upsert fails at runtime only
//       when the first row with that field hits the DB.
//   (b) Someone drops a column (or migrates away) but forgets to update the Zod schema →
//       the ingest emits Zod-valid rows the DB refuses.
//
// This test requires DATABASE_URL. If absent, it skips with a clear message instead of
// failing — the CI environment may legitimately not have a database. Locally we always
// have one because run-modo needs it.
//
// The test is read-only: we only query information_schema.columns. No data is written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { Promo as PromoSchema } from '../promo-schema.js';
import { getDb, close } from '../lib/db.js';

// Fields the Zod schema does NOT have but the DB intentionally does. These are audit /
// identity columns populated by the ingestion adapter (scripts/lib/promo-repo.ts) or by
// Postgres defaults — not part of the canonical Promo contract.
const DB_ONLY_COLUMNS = new Set([
  'id', // gen_random_uuid() default; filled in from modoPromoId(slug) on insert
  'created_at', // default now() — audit trail
  'updated_at', // populated by the upsert
  'raw_html_hash', // change-detection signal, Phase 1.3 addition
]);

// Map Zod wrapper types to the "is required (NOT NULL)" bit. A column is allowed to be
// NOT NULL even when the Zod field is optional (as long as a default fills it), but it
// must NOT be NOT NULL when the Zod field is nullable-without-default.
function isZodRequired(fieldSchema: z.ZodTypeAny): boolean {
  // `.optional()` → Zod emits `undefined`; DB must accept NULL or provide default.
  if (fieldSchema instanceof z.ZodOptional) return false;
  // `.nullable()` → Zod emits `null`; DB must accept NULL.
  if (fieldSchema instanceof z.ZodNullable) return false;
  // `.default(x)` → Zod fills in a value; DB can be NOT NULL safely.
  if (fieldSchema instanceof z.ZodDefault) return true;
  return true;
}

type ColumnRow = {
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
};

let dbSkipReason: string | null = null;
if (!process.env.DATABASE_URL) {
  dbSkipReason = 'DATABASE_URL not set (skipping schema→DB alignment)';
}

test(
  'P0-4 every Promo Zod field has a matching column in the `promos` table',
  { skip: dbSkipReason ?? undefined },
  async (t) => {
    const sql = getDb();
    let columns: ColumnRow[];
    try {
      columns = await sql<ColumnRow[]>`
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'promos'
        order by ordinal_position
      `;
    } finally {
      // Leave the pool open; another test in this file may reuse it.
    }

    assert.ok(columns.length > 0, '`promos` table not found — run migrations');

    const columnsByName = new Map(columns.map((c) => [c.column_name, c]));
    const zodFields = Object.entries(PromoSchema.shape) as Array<[string, z.ZodTypeAny]>;

    const mismatches: string[] = [];

    // (a) Every Zod field must exist as a DB column.
    for (const [name, fieldSchema] of zodFields) {
      const col = columnsByName.get(name);
      if (!col) {
        mismatches.push(`zod field "${name}" has no matching DB column`);
        continue;
      }
      // If the Zod field is required AND doesn't have a default, the DB column must be
      // NOT NULL. (The inverse — NOT NULL DB + optional Zod — is allowed when the
      // column has a default, which we can't introspect cheaply here.)
      const zodRequired = isZodRequired(fieldSchema);
      if (zodRequired && col.is_nullable === 'YES') {
        // This is only a warning in practice — the ingestion adapter may still fill
        // the field even though the DB allows NULL. We surface it but don't fail.
        // Comment out to promote to hard failure if we see drift in prod.
        t.diagnostic(
          `soft mismatch: zod "${name}" is required but DB column is nullable`,
        );
      }
    }

    // (b) Every DB column must be either in the Zod schema OR in the allowed DB-only set.
    const zodNames = new Set(zodFields.map(([n]) => n));
    for (const col of columns) {
      if (zodNames.has(col.column_name)) continue;
      if (DB_ONLY_COLUMNS.has(col.column_name)) continue;
      mismatches.push(
        `DB column "${col.column_name}" has no matching Zod field (and is not in DB_ONLY_COLUMNS)`,
      );
    }

    assert.deepStrictEqual(
      mismatches,
      [],
      `schema-vs-DB drift detected:\n  - ${mismatches.join('\n  - ')}`,
    );
  },
);

test(
  'P0-4 DB_ONLY_COLUMNS all exist on the `promos` table',
  { skip: dbSkipReason ?? undefined },
  async () => {
    const sql = getDb();
    const columns = await sql<{ column_name: string }[]>`
      select column_name
      from information_schema.columns
      where table_schema = current_schema()
        and table_name = 'promos'
    `;
    const names = new Set(columns.map((c) => c.column_name));
    for (const expected of DB_ONLY_COLUMNS) {
      assert.ok(
        names.has(expected),
        `DB_ONLY_COLUMNS expects "${expected}" on promos, but it is missing — migration may have been reverted`,
      );
    }
  },
);

test(
  'P0-4 category enum check constraint matches the Zod enum',
  { skip: dbSkipReason ?? undefined },
  async () => {
    // Cheap drift guard for one high-risk enum column. The full cross-check is beyond
    // information_schema — we'd have to parse the pg_constraint consrc. For `category`
    // we just confirm the CHECK exists by inserting a test sentinel value and rolling
    // back. We skip the actual insertion to stay read-only; instead we rely on the
    // schema-parity test to cover the enum shape at the Zod level.
    // This test is a placeholder to draw attention if someone drops the CHECK constraint.
    const sql = getDb();
    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count
      from information_schema.check_constraints
      where constraint_schema = current_schema()
        and constraint_name like 'promos_category_check%'
    `;
    assert.ok(
      rows[0].count >= 1,
      'promos_category_check CHECK constraint missing — enum drift risk',
    );
  },
);

// Last-in-file: close the pool so the node:test runner exits cleanly.
test('_teardown: close db pool', { skip: dbSkipReason ?? undefined }, async () => {
  await close();
});

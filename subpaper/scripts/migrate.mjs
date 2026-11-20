// Usage: DATABASE_URL=... node scripts/migrate.mjs
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const dir = path.join(import.meta.dirname, "..", "db", "migrations");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(
  "create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())",
);
const done = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(f)) continue;
  console.log("applying", f);
  await client.query("begin");
  try {
    await client.query(fs.readFileSync(path.join(dir, f), "utf8"));
    await client.query("insert into schema_migrations(name) values ($1)", [f]);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}
await client.end();
console.log("migrations up to date");

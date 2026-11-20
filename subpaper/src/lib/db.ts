import pg from "pg";

const g = globalThis as unknown as { __pool?: pg.Pool };

export function pool(): pg.Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  return (g.__pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 }));
}

/** Run `fn` in a transaction scoped to one org; row-level security enforces isolation. */
export async function withOrg<T>(orgId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.org_id', $1, true)", [orgId]);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

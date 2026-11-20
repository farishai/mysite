import { pool, withOrg } from "./db";

export type Counter = "extractions" | "replies";

export const DEFAULT_EXTRACTION_CAP = 100;
export const DEFAULT_REPLY_CAP = 50;

const envInt = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export class CapExceededError extends Error {
  constructor(public cap: number) {
    super(`Daily limit of ${cap} documents reached. It resets at midnight UTC.`);
  }
}

export async function extractionCap(orgId: string): Promise<number> {
  const { rows } = await pool().query("select daily_extraction_cap as cap from orgs where id = $1", [orgId]);
  return rows[0]?.cap ?? envInt("DAILY_EXTRACTION_CAP", DEFAULT_EXTRACTION_CAP);
}

export const replyCap = () => envInt("DAILY_REPLY_CAP", DEFAULT_REPLY_CAP);

/**
 * Atomically take one unit from today's budget. Returns false (and counts nothing) once `cap` is reached.
 * Concurrency-safe: the check and increment are one SQL statement.
 */
export async function reserve(orgId: string, counter: Counter, cap: number): Promise<boolean> {
  if (cap <= 0) return false;
  // `counter` comes from a closed union, never from user input.
  const col = counter === "extractions" ? "extractions" : "replies";
  return withOrg(orgId, async (c) => {
    const r = await c.query(
      `insert into usage_daily (org_id, day, ${col}) values ($1, (now() at time zone 'utc')::date, 1)
       on conflict (org_id, day) do update set ${col} = usage_daily.${col} + 1
         where usage_daily.${col} < $2
       returning ${col}`,
      [orgId, cap],
    );
    return r.rowCount === 1;
  });
}

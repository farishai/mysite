import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthError,
  createSession,
  destroySession,
  getUserBySession,
  hashPassword,
  login,
  signup,
  verifyPassword,
} from "./auth";
import { pool, withOrg } from "./db";

describe("passwords", () => {
  it("verifies correct and rejects wrong password", () => {
    const h = hashPassword("correct horse battery");
    expect(verifyPassword("correct horse battery", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
  it("salts each hash", () => {
    expect(hashPassword("same-password-1")).not.toBe(hashPassword("same-password-1"));
  });
});

// Integration tests need a migrated database: DATABASE_URL=... npm test
describe.skipIf(!process.env.DATABASE_URL)("auth + tenant isolation (postgres)", () => {
  const tag = Date.now();
  const a = `a${tag}@example.com`;
  const b = `b${tag}@example.com`;
  let orgA = "";
  let orgB = "";

  beforeAll(async () => {
    orgA = (await signup(a, "password-aaaa-1", "Org A")).orgId;
    orgB = (await signup(b, "password-bbbb-1", "Org B")).orgId;
  });
  afterAll(async () => {
    await pool().query("delete from orgs where id = any($1)", [[orgA, orgB]]);
    await pool().end();
  });

  it("rejects duplicate email, weak password", async () => {
    await expect(signup(a, "password-aaaa-1", "X")).rejects.toMatchObject({ status: 409 });
    await expect(signup(`c${tag}@example.com`, "short", "X")).rejects.toBeInstanceOf(AuthError);
  });

  it("logs in, resolves session, and logs out", async () => {
    const user = await login(a, "password-aaaa-1");
    const { token } = await createSession(user.userId);
    expect((await getUserBySession(token))?.orgId).toBe(orgA);
    await destroySession(token);
    expect(await getUserBySession(token)).toBeNull();
    await expect(login(a, "nope-nope-nope")).rejects.toMatchObject({ status: 401 });
    await expect(login("nobody@example.com", "whatever-123")).rejects.toMatchObject({ status: 401 });
  });

  it("creates default requirements on signup", async () => {
    const cfg = await withOrg(orgA, async (c) => (await c.query("select config from requirements")).rows);
    expect(cfg).toHaveLength(1);
    expect(cfg[0].config.gcName).toBe("Org A");
  });

  it("isolates documents between orgs via row-level security", async () => {
    const ins = (org: string) =>
      withOrg(org, (c) =>
        c.query(
          `insert into documents (org_id, filename, extraction, issues, status) values ($1,'f.pdf','{}','[]','compliant')`,
          [org],
        ),
      );
    await ins(orgA);
    await ins(orgB);
    const seenByA = await withOrg(orgA, async (c) => (await c.query("select org_id from documents")).rows);
    expect(seenByA.length).toBe(1);
    expect(seenByA[0].org_id).toBe(orgA);
    // Writing into another org's rows is blocked by the policy.
    await expect(ins(orgA).then(() => withOrg(orgA, (c) =>
      c.query(`insert into documents (org_id, filename, extraction, issues, status) values ($1,'x','{}','[]','compliant')`, [orgB]),
    ))).rejects.toThrow();
    // No org context => no rows.
    const none = await pool().query("select * from documents");
    expect(none.rows).toHaveLength(0);
  });
});

import crypto from "node:crypto";
import { pool } from "./db";
import { RequirementsSchema } from "./schema";

export const SESSION_COOKIE = "sp_session";
const SESSION_DAYS = 30;
export const MIN_PASSWORD = 10;

export interface SessionUser {
  userId: string;
  orgId: string;
  email: string;
}

// ---- passwords (scrypt, per-user salt) ----
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const DUMMY_HASH = hashPassword("dummy-password-for-timing");
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

// ---- sessions (random token in cookie, only its hash is stored) ----
export async function createSession(userId: string): Promise<{ token: string; expires: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await pool().query("insert into sessions (token_hash, user_id, expires_at) values ($1,$2,$3)", [
    sha256(token),
    userId,
    expires,
  ]);
  return { token, expires };
}

export async function getUserBySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const { rows } = await pool().query(
    `select u.id as "userId", u.org_id as "orgId", u.email
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] ?? null;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (token) await pool().query("delete from sessions where token_hash = $1", [sha256(token)]);
}

// ---- account flows ----
export class AuthError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function signup(email: string, password: string, orgName: string): Promise<SessionUser> {
  email = email.trim().toLowerCase();
  orgName = orgName.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AuthError("Enter a valid email.");
  if (password.length < MIN_PASSWORD) throw new AuthError(`Password must be at least ${MIN_PASSWORD} characters.`);
  if (!orgName) throw new AuthError("Company name is required.");

  const client = await pool().connect();
  try {
    await client.query("begin");
    const org = await client.query("insert into orgs (name) values ($1) returning id", [orgName]);
    const orgId: string = org.rows[0].id;
    const u = await client.query(
      "insert into users (org_id, email, password_hash) values ($1,$2,$3) returning id",
      [orgId, email, hashPassword(password)],
    );
    // Default requirements for the new org (RLS needs the org context, set in this transaction).
    await client.query("select set_config('app.org_id', $1, true)", [orgId]);
    await client.query("insert into requirements (org_id, config) values ($1,$2)", [
      orgId,
      RequirementsSchema.parse({ gcName: orgName }),
    ]);
    await client.query("commit");
    return { userId: u.rows[0].id, orgId, email };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    if ((e as { code?: string }).code === "23505")
      throw new AuthError("An account with that email already exists.", 409);
    throw e;
  } finally {
    client.release();
  }
}

export async function login(email: string, password: string): Promise<SessionUser> {
  email = email.trim().toLowerCase();
  const { rows } = await pool().query(
    'select id, org_id as "orgId", password_hash from users where email = $1',
    [email],
  );
  const row = rows[0];
  const ok = verifyPassword(password, row?.password_hash ?? DUMMY_HASH); // constant-ish time
  if (!row || !ok) throw new AuthError("Invalid email or password.", 401);
  return { userId: row.id, orgId: row.orgId, email };
}

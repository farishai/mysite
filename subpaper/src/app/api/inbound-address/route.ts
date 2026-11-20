import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { requireUser } from "../../../lib/session";

export async function GET() {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const domain = process.env.INBOUND_DOMAIN;
  const { rows } = await pool().query("select inbound_token from orgs where id = $1", [u.orgId]);
  return NextResponse.json({ address: domain && rows[0] ? `${rows[0].inbound_token}@${domain}` : null });
}

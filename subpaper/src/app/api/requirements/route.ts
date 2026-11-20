import { NextResponse } from "next/server";
import { withOrg } from "../../../lib/db";
import { RequirementsSchema } from "../../../lib/schema";
import { requireUser } from "../../../lib/session";

export async function GET() {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const config = await withOrg(u.orgId, async (c) =>
    (await c.query("select config from requirements where org_id = $1", [u.orgId])).rows[0]?.config,
  );
  return NextResponse.json(RequirementsSchema.parse(config));
}

export async function PUT(req: Request) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const parsed = RequirementsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid requirements" }, { status: 400 });
  await withOrg(u.orgId, (c) =>
    c.query(
      `insert into requirements (org_id, config) values ($1,$2)
       on conflict (org_id) do update set config = excluded.config, updated_at = now()`,
      [u.orgId, parsed.data],
    ),
  );
  return NextResponse.json(parsed.data);
}

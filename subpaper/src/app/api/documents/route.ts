import { NextResponse } from "next/server";
import { withOrg } from "../../../lib/db";
import { extractDocument } from "../../../lib/extract";
import { checkCoi, statusOf } from "../../../lib/rules";
import { RequirementsSchema } from "../../../lib/schema";
import { requireUser } from "../../../lib/session";

const TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
const MAX_BYTES = 10 * 1024 * 1024;

export async function GET() {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const rows = await withOrg(u.orgId, async (c) =>
    (
      await c.query(
        `select id, filename, uploaded_at as "uploadedAt", extraction, issues, status
           from documents order by uploaded_at desc limit 200`,
      )
    ).rows,
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  const type = TYPES.find((t) => t === file.type);
  if (!type) return NextResponse.json({ error: "PDF, PNG or JPEG only" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "max 10MB" }, { status: 413 });

  try {
    const extraction = await extractDocument(Buffer.from(await file.arrayBuffer()), type);
    const doc = await withOrg(u.orgId, async (c) => {
      const cfg = (await c.query("select config from requirements where org_id = $1", [u.orgId])).rows[0]?.config;
      const issues = checkCoi(extraction, RequirementsSchema.parse(cfg));
      const status = statusOf(issues);
      const { rows } = await c.query(
        `insert into documents (org_id, filename, extraction, issues, status, expires_on)
         values ($1,$2,$3,$4,$5,$6)
         returning id, filename, uploaded_at as "uploadedAt", extraction, issues, status`,
        [u.orgId, file.name, extraction, JSON.stringify(issues), status, extraction.expirationDate],
      );
      return rows[0];
    });
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

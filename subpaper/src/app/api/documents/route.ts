import { NextResponse } from "next/server";
import { withOrg } from "../../../lib/db";
import { ingestFile, MAX_FILE_BYTES, MEDIA_TYPES } from "../../../lib/ingest";
import { requireUser } from "../../../lib/session";

export async function GET() {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const rows = await withOrg(u.orgId, async (c) =>
    (
      await c.query(
        `select id, filename, uploaded_at as "uploadedAt", extraction, issues, status, source, sender
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
  const mediaType = MEDIA_TYPES.find((t) => t === file.type);
  if (!mediaType) return NextResponse.json({ error: "PDF, PNG or JPEG only" }, { status: 415 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "max 10MB" }, { status: 413 });

  try {
    const doc = await ingestFile({
      orgId: u.orgId,
      filename: file.name,
      data: Buffer.from(await file.arrayBuffer()),
      mediaType,
      source: "upload",
      sender: u.email,
    });
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

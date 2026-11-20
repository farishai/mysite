import { NextResponse } from "next/server";
import { extractDocument } from "../../../lib/extract";
import { checkCoi, statusOf } from "../../../lib/rules";
import { docs, getRequirements } from "../../../lib/store";

const TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
const MAX_BYTES = 10 * 1024 * 1024;

export async function GET() {
  return NextResponse.json(docs);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  const type = TYPES.find((t) => t === file.type);
  if (!type) return NextResponse.json({ error: "PDF, PNG or JPEG only" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "max 10MB" }, { status: 413 });

  try {
    const extraction = await extractDocument(Buffer.from(await file.arrayBuffer()), type);
    const issues = checkCoi(extraction, getRequirements());
    const doc = {
      id: crypto.randomUUID(),
      filename: file.name,
      uploadedAt: new Date().toISOString(),
      extraction,
      issues,
      status: statusOf(issues),
    };
    docs.unshift(doc);
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

import { after, NextResponse } from "next/server";
import { checkWebhookAuth, parsePostmark, processInbound } from "../../../../lib/inbound";

// Point Postmark's inbound webhook at https://anything:<INBOUND_WEBHOOK_SECRET>@your-host/api/inbound/postmark
export async function POST(req: Request) {
  if (!checkWebhookAuth(req.headers.get("authorization"), process.env.INBOUND_WEBHOOK_SECRET))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const email = parsePostmark(await req.json().catch(() => null));
  if (!email) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  // Extraction can take longer than the webhook timeout: acknowledge now, work after the response.
  // Retries are safe because processInbound is idempotent per (org, MessageID).
  after(async () => {
    try {
      const r = await processInbound(email);
      console.log("inbound", email.messageId, JSON.stringify(r));
    } catch (e) {
      console.error("inbound failed", email.messageId, e);
    }
  });
  return NextResponse.json({ ok: true });
}

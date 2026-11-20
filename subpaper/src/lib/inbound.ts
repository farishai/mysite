import crypto from "node:crypto";
import { z } from "zod";
import { pool, withOrg } from "./db";
import { ingestFile, MAX_FILE_BYTES, MEDIA_TYPES, type Extractor, type MediaType } from "./ingest";

export const MAX_ATTACHMENTS = 10;

// Postmark inbound webhook payload (only the fields we use).
const PostmarkSchema = z.object({
  MessageID: z.string().min(1),
  From: z.string().default(""),
  FromFull: z.object({ Email: z.string() }).partial().optional(),
  Subject: z.string().default(""),
  To: z.string().default(""),
  ToFull: z.array(z.object({ Email: z.string() })).default([]),
  OriginalRecipient: z.string().optional(),
  Attachments: z
    .array(z.object({ Name: z.string(), Content: z.string(), ContentType: z.string().default("") }))
    .default([]),
});

export interface ParsedEmail {
  messageId: string;
  sender: string;
  subject: string;
  tokens: string[]; // candidate inbound tokens (local parts of recipients)
  attachments: { name: string; contentType: string; base64: string }[];
}

export function parsePostmark(payload: unknown): ParsedEmail | null {
  const r = PostmarkSchema.safeParse(payload);
  if (!r.success) return null;
  const p = r.data;
  const addrs = [p.OriginalRecipient, ...p.ToFull.map((t) => t.Email), ...p.To.split(",")]
    .filter((a): a is string => !!a)
    .map((a) => (a.match(/<([^>]+)>/)?.[1] ?? a).trim().toLowerCase());
  const tokens = [...new Set(addrs.map((a) => a.split("@")[0].split("+")[0]).filter(Boolean))];
  return {
    messageId: p.MessageID,
    sender: (p.FromFull?.Email ?? p.From).toLowerCase(),
    subject: p.Subject,
    tokens,
    attachments: p.Attachments.map((a) => ({ name: a.Name, contentType: a.ContentType, base64: a.Content })),
  };
}

/** Resolve the media type, falling back to the file extension for generic content types. */
export function mediaTypeOf(name: string, contentType: string): MediaType | null {
  const ct = contentType.split(";")[0].trim().toLowerCase();
  const direct = MEDIA_TYPES.find((t) => t === ct);
  if (direct) return direct;
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return null;
}

/** Webhook auth: HTTP Basic with the shared secret as the password (Postmark supports user:pass@url). */
export function checkWebhookAuth(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString();
  const given = Buffer.from(decoded.slice(decoded.indexOf(":") + 1));
  const want = Buffer.from(secret);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

export type InboundResult =
  | { result: "unknown_recipient" | "duplicate" }
  | { result: "processed"; status: "done" | "partial" | "failed" | "empty"; processed: number; errors: string[] };

export async function processInbound(email: ParsedEmail, extract?: Extractor): Promise<InboundResult> {
  const { rows: orgs } = await pool().query("select id from orgs where inbound_token = any($1)", [email.tokens]);
  if (orgs.length !== 1) return { result: "unknown_recipient" };
  const orgId: string = orgs[0].id;

  const usable = email.attachments.slice(0, MAX_ATTACHMENTS);
  const inserted = await withOrg(orgId, async (c) =>
    (
      await c.query(
        `insert into inbound_messages (org_id, message_id, sender, subject, attachment_count)
         values ($1,$2,$3,$4,$5) on conflict (org_id, message_id) do nothing returning id`,
        [orgId, email.messageId, email.sender, email.subject.slice(0, 500), email.attachments.length],
      )
    ).rows[0],
  );
  if (!inserted) return { result: "duplicate" };

  let processed = 0;
  const errors: string[] = [];
  if (email.attachments.length > MAX_ATTACHMENTS)
    errors.push(`Only the first ${MAX_ATTACHMENTS} of ${email.attachments.length} attachments were processed.`);

  for (const a of usable) {
    const mediaType = mediaTypeOf(a.name, a.contentType);
    if (!mediaType) continue; // signatures, logos, etc.
    const data = Buffer.from(a.base64, "base64");
    if (data.length === 0 || data.length > MAX_FILE_BYTES) {
      errors.push(`${a.name}: empty or larger than 10MB`);
      continue;
    }
    try {
      await ingestFile({
        orgId,
        filename: a.name,
        data,
        mediaType,
        source: "email",
        sender: email.sender,
        inboundMessageId: inserted.id,
        extract,
      });
      processed++;
    } catch (e) {
      errors.push(`${a.name}: ${(e as Error).message}`);
    }
  }

  const status = processed === 0 ? (errors.length ? "failed" : "empty") : errors.length ? "partial" : "done";
  await withOrg(orgId, (c) =>
    c.query("update inbound_messages set status=$2, processed_count=$3, error=$4 where id=$1", [
      inserted.id,
      status,
      processed,
      errors.length ? errors.join("\n").slice(0, 2000) : null,
    ]),
  );
  return { result: "processed", status, processed, errors };
}

import { withOrg } from "./db";
import { extractDocument } from "./extract";
import { checkCoi, statusOf } from "./rules";
import { RequirementsSchema, type Extraction } from "./schema";
import { CapExceededError, extractionCap, reserve } from "./usage";

export type MediaType = "application/pdf" | "image/png" | "image/jpeg";
export const MEDIA_TYPES: readonly MediaType[] = ["application/pdf", "image/png", "image/jpeg"];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type Extractor = (data: Buffer, mediaType: MediaType) => Promise<Extraction>;

export interface IngestInput {
  orgId: string;
  filename: string;
  data: Buffer;
  mediaType: MediaType;
  source: "upload" | "email";
  sender?: string;
  inboundMessageId?: string;
  extract?: Extractor; // injectable for tests
}

/** Extract a document, check it against the org's requirements, and store it. */
export async function ingestFile(input: IngestInput) {
  // Spend a unit of today's budget before the paid model call. Failed extractions still count: they cost money.
  const cap = await extractionCap(input.orgId);
  if (!(await reserve(input.orgId, "extractions", cap))) throw new CapExceededError(cap);

  const extraction = await (input.extract ?? extractDocument)(input.data, input.mediaType);
  return withOrg(input.orgId, async (c) => {
    const cfg = (await c.query("select config from requirements where org_id = $1", [input.orgId])).rows[0]?.config;
    const issues = checkCoi(extraction, RequirementsSchema.parse(cfg));
    const status = statusOf(issues);
    const { rows } = await c.query(
      `insert into documents (org_id, filename, extraction, issues, status, expires_on, source, sender, inbound_message_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning id, filename, uploaded_at as "uploadedAt", extraction, issues, status, source, sender`,
      [
        input.orgId,
        input.filename.slice(0, 255),
        extraction,
        JSON.stringify(issues),
        status,
        extraction.expirationDate,
        input.source,
        input.sender ?? null,
        input.inboundMessageId ?? null,
      ],
    );
    return rows[0];
  });
}

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signup } from "./auth";
import { pool, withOrg } from "./db";
import { checkWebhookAuth, mediaTypeOf, parsePostmark, processInbound } from "./inbound";
import type { Extractor } from "./ingest";
import type { Extraction } from "./schema";

const goodExtraction: Extraction = {
  docType: "coi",
  confidence: 0.9,
  holderName: "Sparky Electric",
  insurer: "Zenith",
  policyNumber: "P-1",
  effectiveDate: "2026-01-01",
  expirationDate: "2099-01-01",
  generalLiabilityPerOccurrence: 1_000_000,
  generalLiabilityAggregate: 2_000_000,
  workersCompIncluded: true,
  additionalInsuredNames: ["Inbound Co"],
  waiverOfSubrogation: null,
};
const stub: Extractor = async () => goodExtraction;
const b64 = (s: string) => Buffer.from(s).toString("base64");

const payload = (token: string, over: Record<string, unknown> = {}) => ({
  MessageID: `msg-${token}-${Math.random()}`,
  From: "Sparky <sparky@example.com>",
  FromFull: { Email: "Sparky@Example.com" },
  Subject: "COI",
  To: `"Docs" <${token}@in.example.com>`,
  ToFull: [{ Email: `${token}@in.example.com` }],
  OriginalRecipient: `${token}@in.example.com`,
  Attachments: [
    { Name: "coi.pdf", Content: b64("%PDF-fake"), ContentType: "application/pdf" },
    { Name: "logo.gif", Content: b64("GIF"), ContentType: "image/gif" },
    { Name: "scan.JPG", Content: b64("jpg"), ContentType: "application/octet-stream" },
  ],
  ...over,
});

describe("parsing helpers", () => {
  it("parses a Postmark payload", () => {
    const p = parsePostmark(payload("abc123"))!;
    expect(p.tokens).toEqual(["abc123"]);
    expect(p.sender).toBe("sparky@example.com");
    expect(p.attachments).toHaveLength(3);
  });
  it("supports plus-addressing and rejects junk", () => {
    expect(parsePostmark(payload("tok", { OriginalRecipient: "tok+job42@in.example.com" }))!.tokens).toEqual(["tok"]);
    expect(parsePostmark({ nope: 1 })).toBeNull();
  });
  it("detects media types, with extension fallback", () => {
    expect(mediaTypeOf("a.pdf", "application/pdf")).toBe("application/pdf");
    expect(mediaTypeOf("a.JPG", "application/octet-stream")).toBe("image/jpeg");
    expect(mediaTypeOf("a.gif", "image/gif")).toBeNull();
    expect(mediaTypeOf("a.docx", "")).toBeNull();
  });
  it("checks webhook basic auth", () => {
    const h = "Basic " + Buffer.from("user:s3cret").toString("base64");
    expect(checkWebhookAuth(h, "s3cret")).toBe(true);
    expect(checkWebhookAuth(h, "other")).toBe(false);
    expect(checkWebhookAuth(null, "s3cret")).toBe(false);
    expect(checkWebhookAuth(h, undefined)).toBe(false);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("processInbound (postgres)", () => {
  let orgId = "";
  let token = "";
  beforeAll(async () => {
    orgId = (await signup(`in${Date.now()}@example.com`, "password-inbound-1", "Inbound Co")).orgId;
    token = (await pool().query("select inbound_token from orgs where id=$1", [orgId])).rows[0].inbound_token;
  });
  afterAll(async () => {
    await pool().query("delete from orgs where id=$1", [orgId]);
    await pool().end();
  });

  it("stores supported attachments, skips others, and is idempotent", async () => {
    const p = parsePostmark(payload(token, { MessageID: "fixed-id" }))!;
    const r = await processInbound(p, stub);
    expect(r).toMatchObject({ result: "processed", status: "done", processed: 2 });

    const docs = await withOrg(orgId, async (c) => (await c.query("select source, sender, status from documents")).rows);
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ source: "email", sender: "sparky@example.com", status: "compliant" });

    expect(await processInbound(p, stub)).toEqual({ result: "duplicate" });
    expect(await withOrg(orgId, async (c) => (await c.query("select 1 from documents")).rowCount)).toBe(2);
  });

  it("reports partial failure when one attachment fails", async () => {
    let n = 0;
    const flaky: Extractor = async () => {
      if (n++ === 0) throw new Error("model error");
      return goodExtraction;
    };
    const r = await processInbound(parsePostmark(payload(token))!, flaky);
    expect(r).toMatchObject({ result: "processed", status: "partial", processed: 1 });
  });

  it("ignores mail to unknown or ambiguous recipients", async () => {
    expect(await processInbound(parsePostmark(payload("doesnotexist"))!, stub)).toEqual({ result: "unknown_recipient" });
  });

  it("marks emails without usable attachments as empty", async () => {
    const r = await processInbound(parsePostmark(payload(token, { Attachments: [] }))!, stub);
    expect(r).toMatchObject({ status: "empty", processed: 0 });
  });
});

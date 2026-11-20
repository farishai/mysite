import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signup } from "./auth";
import { pool, withOrg } from "./db";
import { parsePostmark, processInbound } from "./inbound";
import { ingestFile, type Extractor } from "./ingest";
import type { Mailer, OutgoingMail } from "./mail";
import type { Extraction } from "./schema";
import { CapExceededError, extractionCap, reserve } from "./usage";

const good: Extraction = {
  docType: "coi",
  confidence: 0.9,
  holderName: "Sparky",
  insurer: "Z",
  policyNumber: "P",
  effectiveDate: "2026-01-01",
  expirationDate: "2099-01-01",
  generalLiabilityPerOccurrence: 1_000_000,
  generalLiabilityAggregate: 2_000_000,
  workersCompIncluded: true,
  additionalInsuredNames: ["Cap Co"],
  waiverOfSubrogation: null,
};
const extract: Extractor = async () => good;
const pdf = Buffer.from("%PDF-fake");

describe.skipIf(!process.env.DATABASE_URL)("daily caps + replies (postgres)", () => {
  let orgId = "";
  let token = "";
  beforeAll(async () => {
    orgId = (await signup(`cap${Date.now()}@example.com`, "password-cap-1234", "Cap Co")).orgId;
    token = (await pool().query("select inbound_token from orgs where id=$1", [orgId])).rows[0].inbound_token;
  });
  afterAll(async () => {
    await pool().query("delete from orgs where id=$1", [orgId]);
    await pool().end();
  });

  const setCap = (n: number | null) => pool().query("update orgs set daily_extraction_cap=$2 where id=$1", [orgId, n]);
  const reset = () => withOrg(orgId, (c) => c.query("delete from usage_daily"));
  const email = (id: string, over: Record<string, unknown> = {}) =>
    parsePostmark({
      MessageID: id,
      From: "sparky@example.com",
      Subject: "COI",
      To: `${token}@in.example.com`,
      Headers: [
        { Name: "Received-SPF", Value: "pass" },
        { Name: "Message-ID", Value: `<${id}@mail>` },
      ],
      Attachments: [
        { Name: "1.pdf", Content: pdf.toString("base64"), ContentType: "application/pdf" },
        { Name: "2.pdf", Content: pdf.toString("base64"), ContentType: "application/pdf" },
        { Name: "3.pdf", Content: pdf.toString("base64"), ContentType: "application/pdf" },
      ],
      ...over,
    })!;

  it("reserve() stops exactly at the cap, even when concurrent", async () => {
    await reset();
    const got = await Promise.all(Array.from({ length: 10 }, () => reserve(orgId, "extractions", 4)));
    expect(got.filter(Boolean)).toHaveLength(4);
    expect(await reserve(orgId, "extractions", 0)).toBe(false);
  });

  it("uses the per-org override over the env default", async () => {
    await setCap(7);
    expect(await extractionCap(orgId)).toBe(7);
    await setCap(null);
    expect(await extractionCap(orgId)).toBe(100);
  });

  it("blocks uploads past the cap with CapExceededError", async () => {
    await reset();
    await setCap(1);
    const input = { orgId, filename: "a.pdf", data: pdf, mediaType: "application/pdf" as const, source: "upload" as const, extract };
    await ingestFile(input);
    await expect(ingestFile(input)).rejects.toBeInstanceOf(CapExceededError);
  });

  it("emailed attachments past the cap are reported, and the reply says so", async () => {
    await reset();
    await setCap(2);
    const sent: OutgoingMail[] = [];
    const mail: Mailer = async (m) => void sent.push(m);
    const r = await processInbound(email("cap-1"), { extract, mail });
    expect(r).toMatchObject({ result: "processed", status: "partial", processed: 2, replied: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("sparky@example.com");
    expect(sent[0].inReplyTo).toBe("<cap-1@mail>");
    expect(sent[0].text).toContain("[OK] 1.pdf");
    expect(sent[0].text).toContain("Daily limit of 2 documents reached");
  });

  it("does not reply to unverified or automated senders, nor after the reply cap", async () => {
    await reset();
    await setCap(null);
    const sent: OutgoingMail[] = [];
    const mail: Mailer = async (m) => void sent.push(m);

    const noSpf = email("r-1", { Headers: [] });
    expect(await processInbound(noSpf, { extract, mail })).toMatchObject({ replied: false });
    const auto = email("r-2", { Headers: [{ Name: "Received-SPF", Value: "pass" }, { Name: "Auto-Submitted", Value: "auto-generated" }] });
    expect(await processInbound(auto, { extract, mail })).toMatchObject({ replied: false });
    expect(sent).toHaveLength(0);

    process.env.DAILY_REPLY_CAP = "1";
    try {
      expect(await processInbound(email("r-3"), { extract, mail })).toMatchObject({ replied: true });
      expect(await processInbound(email("r-4"), { extract, mail })).toMatchObject({ replied: false });
    } finally {
      delete process.env.DAILY_REPLY_CAP;
    }
  });

  it("a failing mailer does not fail ingestion", async () => {
    await reset();
    const mail: Mailer = async () => {
      throw new Error("smtp down");
    };
    const r = await processInbound(email("m-1"), { extract, mail });
    expect(r).toMatchObject({ result: "processed", status: "done", processed: 3, replied: false });
  });
});

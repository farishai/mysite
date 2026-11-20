import Anthropic from "@anthropic-ai/sdk";
import { ExtractionSchema, type Extraction } from "./schema";

const PROMPT = `You extract data from US construction subcontractor paperwork.
Return ONLY a JSON object with exactly these keys:
docType ("coi"|"w9"|"lien_waiver"|"license"|"other"), confidence (0-1, your honest certainty),
holderName, insurer, policyNumber, effectiveDate, expirationDate (ISO YYYY-MM-DD),
generalLiabilityPerOccurrence, generalLiabilityAggregate (numbers in USD),
workersCompIncluded (boolean), additionalInsuredNames (string[]), waiverOfSubrogation (boolean).
Use null for anything not clearly present. Never guess values.`;

export async function extractDocument(
  data: Buffer,
  mediaType: "application/pdf" | "image/png" | "image/jpeg",
): Promise<Extraction> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic();
  const b64 = data.toString("base64");
  const block =
    mediaType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: mediaType, data: b64 } } as const)
      : ({ type: "image", source: { type: "base64", media_type: mediaType, data: b64 } } as const);

  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }],
  });
  const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return ExtractionSchema.parse(JSON.parse(json));
}

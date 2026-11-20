import { z } from "zod";

export const DOC_TYPES = ["coi", "w9", "lien_waiver", "license", "other"] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** Fields the model extracts. Dates are ISO (YYYY-MM-DD) or null when not found. */
export const ExtractionSchema = z.object({
  docType: z.enum(DOC_TYPES),
  confidence: z.number().min(0).max(1),
  holderName: z.string().nullable(),
  insurer: z.string().nullable(),
  policyNumber: z.string().nullable(),
  effectiveDate: z.string().nullable(),
  expirationDate: z.string().nullable(),
  generalLiabilityPerOccurrence: z.number().nullable(),
  generalLiabilityAggregate: z.number().nullable(),
  workersCompIncluded: z.boolean().nullable(),
  additionalInsuredNames: z.array(z.string()),
  waiverOfSubrogation: z.boolean().nullable(),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

/** What a general contractor (GC) requires from its subs. */
export const RequirementsSchema = z.object({
  gcName: z.string(),
  minGlPerOccurrence: z.number().default(1_000_000),
  minGlAggregate: z.number().default(2_000_000),
  requireWorkersComp: z.boolean().default(true),
  requireAdditionalInsured: z.boolean().default(true),
  requireWaiverOfSubrogation: z.boolean().default(false),
  expiryWarningDays: z.number().default(30),
});
export type Requirements = z.infer<typeof RequirementsSchema>;

export type Severity = "error" | "warning";
export interface Issue {
  code: string;
  severity: Severity;
  message: string;
}

import type { Extraction, Issue, Requirements } from "./schema";

const DAY = 86_400_000;

/** Whole days from `now` until `iso` (negative if past). null if unparseable. */
export function daysUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((t - now.getTime()) / DAY);
}

/** Check a certificate of insurance against a GC's requirements. Pure function. */
export function checkCoi(doc: Extraction, req: Requirements, now = new Date()): Issue[] {
  const issues: Issue[] = [];
  const add = (code: string, severity: Issue["severity"], message: string) =>
    issues.push({ code, severity, message });

  if (doc.docType !== "coi") {
    add("wrong_type", "error", `Expected a certificate of insurance, got "${doc.docType}".`);
    return issues;
  }
  if (doc.confidence < 0.7) {
    add("low_confidence", "warning", "Extraction confidence is low; review manually.");
  }

  const left = daysUntil(doc.expirationDate, now);
  if (left === null) add("no_expiry", "error", "Expiration date missing or unreadable.");
  else if (left < 0) add("expired", "error", `Policy expired ${-left} day(s) ago.`);
  else if (left <= req.expiryWarningDays)
    add("expiring_soon", "warning", `Policy expires in ${left} day(s).`);

  const occ = doc.generalLiabilityPerOccurrence;
  if (occ === null) add("gl_occ_missing", "error", "General liability per-occurrence limit not found.");
  else if (occ < req.minGlPerOccurrence)
    add("gl_occ_low", "error", `GL per occurrence $${occ.toLocaleString()} is below required $${req.minGlPerOccurrence.toLocaleString()}.`);

  const agg = doc.generalLiabilityAggregate;
  if (agg === null) add("gl_agg_missing", "error", "General liability aggregate limit not found.");
  else if (agg < req.minGlAggregate)
    add("gl_agg_low", "error", `GL aggregate $${agg.toLocaleString()} is below required $${req.minGlAggregate.toLocaleString()}.`);

  if (req.requireWorkersComp && doc.workersCompIncluded !== true)
    add("no_workers_comp", "error", "Workers' compensation coverage not shown.");

  if (req.requireAdditionalInsured) {
    const target = req.gcName.trim().toLowerCase();
    const ok = doc.additionalInsuredNames.some((n) => n.toLowerCase().includes(target));
    if (!ok) add("no_additional_insured", "error", `${req.gcName} is not listed as additional insured.`);
  }

  if (req.requireWaiverOfSubrogation && doc.waiverOfSubrogation !== true)
    add("no_waiver_subrogation", "error", "Waiver of subrogation not shown.");

  return issues;
}

export type Status = "compliant" | "warning" | "non_compliant";
export function statusOf(issues: Issue[]): Status {
  if (issues.some((i) => i.severity === "error")) return "non_compliant";
  if (issues.length) return "warning";
  return "compliant";
}

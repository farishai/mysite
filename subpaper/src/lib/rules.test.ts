import { describe, expect, it } from "vitest";
import { checkCoi, daysUntil, statusOf } from "./rules";
import { RequirementsSchema, type Extraction } from "./schema";

const now = new Date("2026-06-01T00:00:00Z");
const req = RequirementsSchema.parse({ gcName: "Acme Builders" });
const good: Extraction = {
  docType: "coi",
  confidence: 0.95,
  holderName: "Sparky Electric",
  insurer: "Zenith",
  policyNumber: "P-1",
  effectiveDate: "2026-01-01",
  expirationDate: "2027-01-01",
  generalLiabilityPerOccurrence: 1_000_000,
  generalLiabilityAggregate: 2_000_000,
  workersCompIncluded: true,
  additionalInsuredNames: ["Acme Builders LLC"],
  waiverOfSubrogation: null,
};

describe("checkCoi", () => {
  it("passes a compliant COI", () => {
    const issues = checkCoi(good, req, now);
    expect(issues).toEqual([]);
    expect(statusOf(issues)).toBe("compliant");
  });
  it("flags expired policy", () => {
    const i = checkCoi({ ...good, expirationDate: "2026-05-01" }, req, now);
    expect(i.map((x) => x.code)).toContain("expired");
    expect(statusOf(i)).toBe("non_compliant");
  });
  it("warns when expiring soon", () => {
    const i = checkCoi({ ...good, expirationDate: "2026-06-15" }, req, now);
    expect(i[0].code).toBe("expiring_soon");
    expect(statusOf(i)).toBe("warning");
  });
  it("flags low limits and missing additional insured", () => {
    const i = checkCoi({ ...good, generalLiabilityPerOccurrence: 500_000, additionalInsuredNames: [] }, req, now);
    expect(i.map((x) => x.code)).toEqual(expect.arrayContaining(["gl_occ_low", "no_additional_insured"]));
  });
  it("rejects wrong doc type", () => {
    expect(checkCoi({ ...good, docType: "w9" }, req, now)[0].code).toBe("wrong_type");
  });
  it("daysUntil handles bad input", () => {
    expect(daysUntil("nope", now)).toBeNull();
    expect(daysUntil(null, now)).toBeNull();
  });
});

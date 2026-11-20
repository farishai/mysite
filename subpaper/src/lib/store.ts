import type { Extraction, Issue, Requirements } from "./schema";
import type { Status } from "./rules";
import { RequirementsSchema } from "./schema";

export interface StoredDoc {
  id: string;
  filename: string;
  uploadedAt: string;
  extraction: Extraction;
  issues: Issue[];
  status: Status;
}

/**
 * MVP in-memory store (resets on restart, single process).
 * Replace with Postgres using db/schema.sql before real customers.
 */
const g = globalThis as unknown as { __docs?: StoredDoc[]; __req?: Requirements };
export const docs = (g.__docs ??= []);
export const getRequirements = () =>
  (g.__req ??= RequirementsSchema.parse({ gcName: "Acme Builders" }));
export const setRequirements = (r: Requirements) => (g.__req = r);

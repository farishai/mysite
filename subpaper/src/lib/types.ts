import type { Extraction, Issue } from "./schema";
import type { Status } from "./rules";

export interface StoredDoc {
  id: string;
  filename: string;
  uploadedAt: string;
  extraction: Extraction;
  issues: Issue[];
  status: Status;
}

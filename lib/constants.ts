import type { DocumentType } from "@/types/database";

// Shared across the upload form and the documents browser's type filter.
export const DOCUMENT_TYPES: DocumentType[] = [
  "receipt",
  "lease",
  "closing_disclosure",
  "tax_document",
  "insurance",
  "statement",
  "appraisal",
  "other",
];

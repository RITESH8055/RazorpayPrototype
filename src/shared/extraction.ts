// Code guardrails for the reply-reading output (PRD v0.2, B8). The model only fills a fixed
// schema; unknown fields are dropped and anything malformed throws so the caller falls back.
import type { Extraction, Field } from "../lib/types";

export class InvalidExtraction extends Error {}

const INSTRUCTION_RE =
  /\b(release (all )?(the )?(funds?|payments?|money)|release kar(o|do| do| dijiye)|approve (this|the|all)|verified merchant|mark(ed)? (as )?verified|system( note)?\s*:|ignore (all |any |the )?(previous|prior|above|earlier) (instructions|rules)|you (must|should) (release|approve)|(saare|sab) (funds?|paise?) release|(note|message|instruction)s? (to|for) (the )?(reviewer|analyst|model|ai|system)\b)/i;

/** True if the text looks like it is trying to instruct the reviewer or the model. */
export function looksLikeInstructions(text: string | undefined | null) {
  return !!text && INSTRUCTION_RE.test(text);
}

function field<T>(raw: unknown, kind: "string" | "number"): Field<T> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const conf = typeof r.confidence === "number" && !Number.isNaN(r.confidence) ? Math.min(1, Math.max(0, r.confidence)) : 0;
  if (kind === "number") {
    const v = typeof r.value === "number" ? r.value : Number(String(r.value ?? "").replace(/[^0-9.]/g, ""));
    return { value: (Number.isFinite(v) ? v : 0) as T, confidence: Number.isFinite(v) ? conf : 0 };
  }
  return { value: String(r.value ?? "").trim() as T, confidence: conf };
}

export function parseExtraction(raw: unknown): Extraction {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new InvalidExtraction("Not a JSON object");
  const r = raw as Record<string, unknown>;
  for (const k of ["buyer_name", "gstin", "invoice_total", "quantity_total", "invoice_date"]) {
    if (!r[k] || typeof r[k] !== "object") throw new InvalidExtraction(`Missing ${k}`);
  }
  return {
    buyer_name: field<string>(r.buyer_name, "string"),
    gstin: field<string>(r.gstin, "string"),
    invoice_total: field<number>(r.invoice_total, "number"),
    line_items: Array.isArray(r.line_items)
      ? r.line_items.slice(0, 50).map((li) => {
          const x = (li ?? {}) as Record<string, unknown>;
          return { description: String(x.description ?? ""), quantity: Number(x.quantity) || 0, amount: Number(x.amount) || 0 };
        })
      : [],
    quantity_total: field<number>(r.quantity_total, "number"),
    delivery_addresses: Array.isArray(r.delivery_addresses) ? r.delivery_addresses.slice(0, 200).map(String) : [],
    invoice_date: field<string>(r.invoice_date, "string"),
    document_contains_instructions: r.document_contains_instructions === true,
  };
}

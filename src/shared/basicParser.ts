// Basic local parser (PRD v0.3, B3): used when the live reply-reading call fails, so
// "Try to fool it" and the eval runner still return a result. Deliberately simple regex
// rules; the same checks and reserve logic run on its output.
import type { Extraction } from "../lib/types";
import { looksLikeInstructions } from "./extraction";

const BASIC = 0.7; // a regex hit is plausible but not certain
const AMBIGUOUS = 0.4; // below LOW_CONFIDENCE, so dependent checks fail

const GSTIN_TOKEN = /\b\d{2}[A-Z0-9]{13}\b/;
const AMOUNT = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/gi;
const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";

function amounts(line: string) {
  return [...line.matchAll(AMOUNT)].map((m) => Number(m[1].replace(/,/g, ""))).filter((n) => Number.isFinite(n) && n > 0);
}

function isoDate(text: string) {
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return iso[0];
  const m = new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS})[a-z]*\\s+(20\\d{2})\\b`, "i").exec(text);
  if (!m) return "";
  const month = MONTHS.split("|").indexOf(m[2].toLowerCase().slice(0, 3)) + 1;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export function basicParse(text: string): Extraction {
  const all = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const injected = all.some(looksLikeInstructions);
  // Instruction-like lines are data, never parsed for fields.
  const lines = all.filter((l) => !looksLikeInstructions(l));

  // Buyer: rest of the "Bill to" / "Buyer" line, else the next line.
  let buyer = "";
  let buyerLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:bill(?:ed)? to|buyer|sold to)\s*[:\-]?\s*(.*)$/i.exec(lines[i]);
    if (m) {
      buyerLine = i;
      buyer = (m[1] || lines[i + 1] || "").split(/,|\bgstin\b/i)[0].trim();
      break;
    }
  }

  // GSTIN: on the buyer line (or the line after), else the last GSTIN-looking token.
  const near = buyerLine >= 0 ? [lines[buyerLine], lines[buyerLine + 1] ?? ""].join(" ") : "";
  const tokens = lines.flatMap((l) => l.match(new RegExp(GSTIN_TOKEN, "g")) ?? []);
  const gstin = (GSTIN_TOKEN.exec(near.toUpperCase())?.[0] ?? tokens[tokens.length - 1] ?? "").toUpperCase();

  // Total: the largest ₹ amount; if lines labelled "total" disagree, it is ambiguous.
  const every = lines.flatMap(amounts);
  const totalLines = lines.filter((l) => /total|grand|payable|amount due/i.test(l) && !/quantity|qty/i.test(l));
  const labelled = [...new Set(totalLines.flatMap(amounts))];
  const total = every.length ? Math.max(...every) : 0;
  const totalConf = !total ? 0 : labelled.length > 1 || /\?/.test(totalLines.join(" ")) ? AMBIGUOUS : BASIC;

  // Quantity: "Total quantity: N", else the largest number before sets/pcs/units.
  const qLabel = /(?:total )?(?:quantity|qty)\s*[:\-]?\s*(\d+)/i.exec(lines.filter((l) => /total/i.test(l)).join(" "));
  const qUnits = lines.flatMap((l) => [...l.matchAll(/(\d[\d,]*)\s*(?:festive\s+)?(?:sets?|pcs|pieces|units|boxes|parcels|orders)\b/gi)].map((m) => Number(m[1].replace(/,/g, ""))));
  const quantity = qLabel ? Number(qLabel[1]) : qUnits.length ? Math.max(...qUnits) : 0;

  const addresses = lines.filter((l) => /^ship(?:ped)? to\s*[:\-]/i.test(l)).map((l) => l.replace(/^ship(?:ped)? to\s*[:\-]\s*/i, ""));
  const date = isoDate(lines.join(" "));

  return {
    buyer_name: { value: buyer, confidence: buyer ? BASIC : 0 },
    gstin: { value: gstin, confidence: gstin ? BASIC : 0 },
    invoice_total: { value: total, confidence: totalConf },
    line_items: [],
    quantity_total: { value: quantity, confidence: quantity ? BASIC : 0 },
    delivery_addresses: addresses,
    invoice_date: { value: date, confidence: date ? BASIC : 0 },
    document_contains_instructions: injected,
  };
}

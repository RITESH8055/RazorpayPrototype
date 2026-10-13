// Shared pieces of the reply-reading result, used by the review panel and "Try to fool it".
import type { Check, Extraction, Pattern } from "../lib/types";
import { inr } from "../shared/format";
import { LOW_CONFIDENCE } from "../shared/checks";

type Row = { key: keyof Extraction; label: string; fmt?: (x: number) => string };
const INVOICE_ROWS: Row[] = [
  { key: "buyer_name", label: "Buyer name" },
  { key: "gstin", label: "GSTIN" },
  { key: "invoice_total", label: "Invoice total", fmt: (x) => inr(x) },
  { key: "quantity_total", label: "Quantity total" },
  { key: "invoice_date", label: "Date" },
];
// A dispatch reply only carries a count and a date.
const CAPACITY_ROWS: Row[] = [
  { key: "quantity_total", label: "Orders to ship" },
  { key: "invoice_date", label: "Ship by" },
];

export function ExtractedTable({ extraction, kind }: { extraction: Extraction; kind: Pattern["kind"] }) {
  return (
    <table className="w-full text-[12px]">
      <tbody>
        {(kind === "capacity" ? CAPACITY_ROWS : INVOICE_ROWS).map(({ key, label, fmt }) => {
          const f = extraction[key] as { value: string | number; confidence: number };
          const low = f.confidence < LOW_CONFIDENCE;
          const val = f.value === "" || f.value === 0 ? "—" : fmt && typeof f.value === "number" ? fmt(f.value) : String(f.value);
          return (
            <tr key={key} className="border-b border-line/60">
              <td className="py-1 pr-2 text-ink-muted">{label}</td>
              <td className="py-1 font-medium">{val}</td>
              <td className={`py-1 text-right text-[11px] ${low ? "font-semibold text-warn" : "text-ink-subtle"}`}>{low ? "low confidence" : f.confidence.toFixed(2)}</td>
            </tr>
          );
        })}
        {kind === "bulk_buyer" && (<>
        <tr className="border-b border-line/60 align-top">
          <td className="py-1 pr-2 text-ink-muted">Line items</td>
          <td className="py-1" colSpan={2}>
            {extraction.line_items.length
              ? extraction.line_items.map((li, i) => (
                  <div key={i}>
                    {li.description} × {li.quantity}
                  </div>
                ))
              : "—"}
          </td>
        </tr>
        <tr className="align-top">
          <td className="py-1 pr-2 text-ink-muted">Delivery</td>
          <td className="py-1" colSpan={2}>
            {extraction.delivery_addresses.length ? extraction.delivery_addresses.map((a) => <div key={a}>{a}</div>) : "—"}
          </td>
        </tr>
        </>)}
      </tbody>
    </table>
  );
}

export function ChecksList({ checks }: { checks: Check[] }) {
  return (
    <ul className="space-y-1">
      {checks.map((c) => (
        <li key={c.name} className="flex gap-2 text-[12px]">
          <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${c.pass ? "bg-positive" : "bg-danger"}`}>{c.pass ? "✓" : "✕"}</span>
          <span>
            <b>{c.name}</b>
            {c.independent && <span className="ml-1 text-[10px] text-ink-subtle">(independent)</span>}
            <div className="text-ink-body">{c.detail}</div>
          </span>
        </li>
      ))}
    </ul>
  );
}

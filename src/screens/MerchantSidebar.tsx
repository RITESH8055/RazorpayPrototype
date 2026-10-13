// Right-hand column for the merchant screens on wide displays: the next things a merchant
// wants to know. Never shows signals, card or device counts, or weights.
import type { ReactNode } from "react";
import { useCase } from "../state/store";
import { derivePattern } from "../state/derive";
import { Button } from "../components/ui";
import { fmtDate, lakh } from "../shared/format";
import { addDays, DISCOUNT, TRUST_RULES } from "../shared/reserve";
import type { TrustLevel } from "../lib/types";

/** Spike settlement split, shared by the sidebar and the spike screen. */
export function useSettlement() {
  const { scenario: s, cs, trust, spikeValue } = useCase();
  const views = s.patterns.map((p) => derivePattern(s, trust, p, cs.patterns[p.id], cs.reads[p.id], cs.decisions[p.id]));
  const waiting = views.reduce((a, v) => a + v.waiting, 0);
  const stopped = views.reduce((a, v) => a + v.stopped, 0);
  const open = views.filter((v) => !v.decision && v.state.status !== "submitted" && v.state.status !== "not_recognised").length;
  return { views, waiting, stopped, open, onTime: spikeValue - waiting - stopped, spikeValue };
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-card">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Live view of the sale, linking to the settlement screen. */
export function LiveSale() {
  const { features: f, cs, scenario: s, dispatch } = useCase();
  const { onTime, waiting, open } = useSettlement();
  const env = s.envelope;
  const inside = f.volume_multiple >= env.volume_multiple_min && f.volume_multiple <= env.volume_multiple_max;
  const declared = cs.declarationStatus === "submitted";
  return (
    <Panel title="Today">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-positive" />
        </span>
        <span className="text-[15px] font-semibold">{declared ? "Your sale is live" : "Sales are up"}</span>
      </div>
      <dl className="mt-3 space-y-2 text-[15px]">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Orders, last 24h</dt>
          <dd className="font-semibold">{f.spike_orders.toLocaleString("en-IN")}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Vs your usual</dt>
          <dd className="font-semibold">
            {f.volume_multiple}× {declared && <span className={`font-normal ${inside ? "text-positive" : "text-ink-muted"}`}>{inside ? "· in plan" : "· above plan"}</span>}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Settling on time</dt>
          <dd className="font-semibold text-positive">{lakh(onTime)}</dd>
        </div>
        {waiting > 0 && (
          <div className="flex justify-between">
            <dt className="text-ink-muted">{open ? "Waiting on you" : "Held for now"}</dt>
            <dd className="font-semibold">{lakh(waiting)}</dd>
          </div>
        )}
      </dl>
      <Button className="mt-4 w-full" variant={open ? "primary" : "secondary"} onClick={() => dispatch({ type: "screen", screen: "spike" })}>
        {open ? `Answer ${open === 1 ? "1 question" : `${open} questions`}` : "See settlement"}
      </Button>
    </Panel>
  );
}

const NEXT: Record<TrustLevel, { level: TrustLevel; orders: number; days: number } | null> = {
  New: { level: "Building", orders: TRUST_RULES.buildingMinOrders, days: TRUST_RULES.newMaxDays },
  Building: { level: "Trusted", orders: TRUST_RULES.trustedMinOrders, days: TRUST_RULES.trustedMinDays },
  Trusted: null,
};
const PERKS: Record<TrustLevel, string> = {
  New: "Every unusual group of orders gets a question.",
  Building: "One-tap answers, and holds up to 25% smaller.",
  Trusted: "No questions when payment data matches, and holds up to 50% smaller.",
};

/** Progress to the next trust level: the reason to keep shipping well. */
export function TrustProgress() {
  const { scenario: s, trust } = useCase();
  const h = s.history;
  const next = NEXT[trust];
  const bar = (value: number, target: number) => (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-alt-2">
      <div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.min(100, (value / target) * 100)}%` }} />
    </div>
  );
  return (
    <Panel title="Your trust level">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-[20px] font-semibold">{trust}</span>
        <span className="text-[13px] text-ink-muted">{Math.round(DISCOUNT[trust] * 100)}% smaller holds</span>
      </div>
      <p className="mt-1 text-[14px] text-ink-body">{PERKS[trust]}</p>
      {next && (
        <div className="mt-4 space-y-3 text-[13px]">
          <div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Delivered orders</span>
              <span>
                {h.clean_delivered_orders.toLocaleString("en-IN")} / {next.orders.toLocaleString("en-IN")}
              </span>
            </div>
            {bar(h.clean_delivered_orders, next.orders)}
          </div>
          <div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Days on Razorpay</span>
              <span>
                {h.days_on_razorpay} / {next.days}
              </span>
            </div>
            {bar(h.days_on_razorpay, next.days)}
          </div>
          <p className="rounded-xl bg-brand-wash/70 px-3 py-2 text-[13px] text-ink-body">
            <b className="text-brand-dark">Next: {next.level}.</b> {PERKS[next.level]} Keep disputes under {TRUST_RULES.maxDisputeRatePct}%.
          </p>
        </div>
      )}
    </Panel>
  );
}

/** What the merchant can still do to keep money moving. */
export function ReadyChecklist() {
  const { merchant, cs } = useCase();
  const shared = (id: string) => merchant.sources.find((x) => x.id === id)?.status === "shared";
  const items: { done: boolean; title: string; sub: string }[] = [
    { done: cs.declarationStatus === "submitted", title: "Declare your sale", sub: "Orders inside your plan settle on time." },
    { done: shared("bank"), title: "Share bank history", sub: "Lets us pre-clear more of your sale." },
    { done: shared("gst"), title: "Share GST status", sub: "Helps confirm bulk and business orders." },
    { done: false, title: "Keep invoices for bulk orders", sub: "If we ask, a photo of the invoice is enough." },
    { done: false, title: "Ship within 48 hours", sub: "On-time delivery builds trust fastest." },
  ];
  const done = items.filter((i) => i.done).length;
  return (
    <Panel title={`Sale checklist · ${done} of ${items.length}`}>
      <ul className="space-y-3">
        {items.map((i) => (
          <li key={i.title} className="flex gap-3">
            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${i.done ? "bg-positive text-white" : "border-2 border-line text-transparent"}`}>✓</span>
            <div>
              <div className={`text-[14px] font-medium ${i.done ? "text-ink-muted line-through decoration-ink-subtle/50" : "text-ink"}`}>{i.title}</div>
              {!i.done && <div className="text-[13px] text-ink-muted">{i.sub}</div>}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** When the money lands. Payout dates follow the usual T+2 cycle (assumed). */
export function PayoutTimeline() {
  const { cs, scenario: s } = useCase();
  const { onTime, waiting, open, views } = useSettlement();
  const spikeDay = addDays(s.startIso.slice(0, 10), Math.floor(s.spikeStartHour / 24));
  const decided = views.find((v) => v.decision)?.decision;
  const rows: { when: string; what: string; amount: number; tone: "positive" | "neutral" }[] = [{ when: fmtDate(addDays(spikeDay, 2)), what: "Regular payout", amount: onTime, tone: "positive" }];
  if (waiting > 0) {
    rows.push(
      decided
        ? { when: fmtDate(decided.reserveUntil), what: "Held amount, if no disputes", amount: waiting, tone: "neutral" }
        : { when: open ? "After you answer" : "After review", what: "Amount in question", amount: waiting, tone: "neutral" },
    );
  }
  return (
    <Panel title="Payouts">
      <ol className="relative space-y-4 border-l-2 border-surface-alt-2 pl-4">
        {rows.map((r) => (
          <li key={r.what} className="relative">
            <span className={`absolute -left-[23px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${r.tone === "positive" ? "bg-positive" : "bg-ink-subtle"}`} />
            <div className="text-[13px] text-ink-muted">{r.when}</div>
            <div className="flex justify-between gap-3 text-[15px]">
              <span>{r.what}</span>
              <b className={r.tone === "positive" ? "text-positive" : ""}>{lakh(r.amount)}</b>
            </div>
          </li>
        ))}
      </ol>
      {cs.declarationStatus !== "submitted" && <p className="mt-4 text-[13px] text-ink-muted">Declaring your next sale lets us pre-clear more of it.</p>}
    </Panel>
  );
}

/** Plain-language reassurance. Says why questions happen without naming any signal. */
export function WhyQuestions() {
  return (
    <Panel title="Why we ask">
      <p className="text-[14px] leading-relaxed text-ink-body">
        Sometimes a group of orders looks different from your usual. Instead of holding your whole settlement, we ask one plain question about that group. Most answers clear it in one round.
      </p>
    </Panel>
  );
}

import { useState, type ReactNode } from "react";
import { coverage, useCase } from "../state/store";
import type { Declaration, ProfileSource } from "../lib/types";
import { AiBadge, Button, Group, Modal, Row, Toggle } from "../components/ui";
import { fmtDate, lakh } from "../shared/format";

const EMPTY: Declaration = {
  sale_name: "",
  start: "2026-10-24",
  end: "2026-10-31",
  offer_text: "",
  expected_daily_orders_min: 0,
  expected_daily_orders_max: 0,
  influencer_plan: "",
};

const TRUST_COPY = { New: "New on Razorpay", Building: "Building trust", Trusted: "Trusted seller" } as const;

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-[13px] font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "w-full rounded-xl bg-surface-alt px-3.5 py-2.5 text-[15px] outline-none ring-brand/40 placeholder:text-ink-subtle focus:bg-white focus:ring-2";

export default function DeclareScreen() {
  const { scenario: s, merchant, cs, dispatch, trust, baselineDailyValue } = useCase();
  const [viewing, setViewing] = useState<ProfileSource | null>(null);
  const [withdrawing, setWithdrawing] = useState<ProfileSource | "all" | null>(null);
  const [showEnvelope, setShowEnvelope] = useState(false);
  const cov = coverage(merchant);
  const d = cs.declaration;
  const status = cs.declarationStatus;
  const set = (k: keyof Declaration, v: string | number) => d && dispatch({ type: "declChange", declaration: { ...d, [k]: v } });
  const env = s.envelope;
  const preclear = baselineDailyValue * Math.min(env.volume_multiple_max, s.category_ceiling_multiple);
  const optionalShared = merchant.sources.some((x) => x.withdrawable && x.status === "shared");

  return (
    <div className="mx-auto max-w-[720px] space-y-8 pb-6 pt-2">
      {/* Large title */}
      <header>
        <p className="text-[13px] font-medium text-ink-muted">
          {merchant.category} · {merchant.city}
        </p>
        <h1 className="mt-1 font-display text-[34px] font-semibold leading-tight tracking-tight">{merchant.name}</h1>
        <p className="mt-1.5 flex items-center gap-2 text-[15px] text-ink-body">
          <span className={`h-2 w-2 rounded-full ${trust === "Trusted" ? "bg-positive" : trust === "Building" ? "bg-brand" : "bg-ink-subtle"}`} />
          {TRUST_COPY[trust]} · {s.history.clean_delivered_orders.toLocaleString("en-IN")} orders delivered, {s.history.dispute_rate_pct}% disputes
        </p>
      </header>

      {/* The sale */}
      {status === "submitted" && d ? (
        <section className="rounded-2xl bg-white shadow-card">
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div>
              <div className="text-[13px] font-medium text-ink-muted">Your sale</div>
              <div className="mt-0.5 font-display text-[22px] font-semibold">{d.sale_name}</div>
              <div className="text-[15px] text-ink-body">
                {fmtDate(d.start)} to {fmtDate(d.end)}
              </div>
            </div>
            <Button variant="plain" onClick={() => dispatch({ type: "declEdit" })}>
              Edit
            </Button>
          </div>
          <div className="mx-6 mt-4 flex items-center gap-3 rounded-xl bg-positive-wash px-4 py-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-positive text-[12px] font-bold text-white">✓</span>
            <span className="text-[15px] text-ink">
              Orders up to <b>{lakh(preclear)} a day</b> are pre-cleared and settle on time.
            </span>
          </div>
          <dl className="mt-2 divide-y divide-line/60 px-6">
            <div className="flex justify-between gap-6 py-3 text-[15px]">
              <dt className="text-ink-muted">Offer</dt>
              <dd className="text-right">{d.offer_text}</dd>
            </div>
            <div className="flex justify-between gap-6 py-3 text-[15px]">
              <dt className="text-ink-muted">Expected orders</dt>
              <dd>
                {d.expected_daily_orders_min.toLocaleString("en-IN")} to {d.expected_daily_orders_max.toLocaleString("en-IN")} a day
              </dd>
            </div>
            {d.influencer_plan && (
              <div className="flex justify-between gap-6 py-3 text-[15px]">
                <dt className="text-ink-muted">Influencer plan</dt>
                <dd className="text-right">{d.influencer_plan}</dd>
              </div>
            )}
          </dl>
          <div className="px-6 pb-5">
            <button className="mt-1 text-[13px] font-semibold text-brand-dark" onClick={() => setShowEnvelope(!showEnvelope)}>
              {showEnvelope ? "Hide" : "What we'll expect"} {showEnvelope ? "▴" : "▾"}
            </button>
            {showEnvelope && EnvelopeNote()}
          </div>
        </section>
      ) : status === "draft" && d ? (
        <section className="rounded-2xl bg-white p-6 shadow-card">
          <h2 className="font-display text-[22px] font-semibold">Tell us about your sale</h2>
          <p className="mt-1 text-[15px] text-ink-muted">It takes a minute. Orders inside your plan settle on time.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Sale name" wide>
              <input className={inputCls} value={d.sale_name} onChange={(e) => set("sale_name", e.target.value)} placeholder="e.g. Diwali Sale" />
            </Field>
            <Field label="Starts">
              <input type="date" className={inputCls} value={d.start} onChange={(e) => set("start", e.target.value)} />
            </Field>
            <Field label="Ends">
              <input type="date" className={inputCls} value={d.end} onChange={(e) => set("end", e.target.value)} />
            </Field>
            <Field label="Offer (link or a line about it)" wide>
              <input className={inputCls} value={d.offer_text} onChange={(e) => set("offer_text", e.target.value)} placeholder="e.g. Buy 2, get 25% off" />
            </Field>
            <Field label="Orders a day, at least">
              <input type="number" min={0} className={inputCls} value={d.expected_daily_orders_min || ""} onChange={(e) => set("expected_daily_orders_min", Number(e.target.value))} />
            </Field>
            <Field label="Orders a day, at most">
              <input type="number" min={0} className={inputCls} value={d.expected_daily_orders_max || ""} onChange={(e) => set("expected_daily_orders_max", Number(e.target.value))} />
            </Field>
            <Field label="Influencer plan (optional)" wide>
              <input className={inputCls} value={d.influencer_plan} onChange={(e) => set("influencer_plan", e.target.value)} placeholder="e.g. Reel with a creator on launch day" />
            </Field>
          </div>
          <Button size="lg" className="mt-6 w-full" onClick={() => dispatch({ type: "declSubmit" })} disabled={!d.sale_name.trim()}>
            {s.declaration ? "Save sale" : "Declare sale"}
          </Button>
        </section>
      ) : (
        <section className="rounded-2xl bg-white px-6 py-10 text-center shadow-card">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-wash text-[22px] text-brand">＋</div>
          <h2 className="mt-4 font-display text-[22px] font-semibold">No sale declared</h2>
          <p className="mx-auto mt-1 max-w-sm text-[15px] text-ink-muted">Planning a sale? Declare it to keep settlements moving. Orders inside your plan pay out on time.</p>
          <Button size="lg" className="mt-6" onClick={() => dispatch({ type: "declEdit", declaration: { ...EMPTY } })}>
            Declare a sale
          </Button>
        </section>
      )}

      {/* Data sharing, settings style */}
      <Group
        title="Data for this sale"
        footer={
          <>
            {cov.shared} of {cov.total} sources shared. Used only to review payments from this sale, and you can turn any of them off.
            {optionalShared && (
              <>
                {" "}
                <button className="font-semibold text-danger" onClick={() => setWithdrawing("all")}>
                  Stop sharing
                </button>
              </>
            )}
          </>
        }
      >
        {merchant.sources.map((src) => {
          const on = src.status === "shared" || src.status === "always_on";
          return (
            <Row
              key={src.id}
              label={src.name}
              sub={src.status === "always_on" ? "Always on. Razorpay already holds this." : src.status === "withdrawn" ? "Withdrawn. Data deleted." : src.helper ?? src.via}
              muted={src.status === "withdrawn"}
              right={
                <div className="flex items-center gap-3">
                  {on && (
                    <button className="text-[13px] font-semibold text-brand-dark" onClick={() => setViewing(src)}>
                      View
                    </button>
                  )}
                  <Toggle
                    label={`Share ${src.name}`}
                    on={on}
                    disabled={!src.withdrawable}
                    onChange={(next) => (next ? dispatch({ type: "share", source: src.id }) : setWithdrawing(src))}
                  />
                </div>
              }
            />
          );
        })}
      </Group>

      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)}>
          <div className="mb-2 text-[13px] text-ink-muted">
            From {viewing.via}
            {viewing.pulledOn ? ` · ${fmtDate(viewing.pulledOn)}` : ""}
          </div>
          <dl className="divide-y divide-line/60 text-[15px]">
            {viewing.details.map((x) => (
              <div key={x.label} className="flex justify-between gap-4 py-2.5">
                <dt className="text-ink-muted">{x.label}</dt>
                <dd className="text-right">{x.value}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}

      {withdrawing && (
        <Modal title={withdrawing === "all" ? "Stop sharing?" : `Stop sharing ${withdrawing.name}?`} onClose={() => setWithdrawing(null)}>
          <p className="text-[15px] leading-relaxed text-ink-body">
            {withdrawing === "all"
              ? "We'll stop using every optional source for this sale and delete what we pulled. Razorpay order history stays on, as it's needed to pay you."
              : `We'll delete what we pulled from ${withdrawing.via}. If something unusual shows up, we may need to ask you more.`}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={() => setWithdrawing(null)}>
              Keep sharing
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={() => {
                if (withdrawing === "all") dispatch({ type: "stopSharing" });
                else dispatch({ type: "withdraw", source: withdrawing.id });
                setWithdrawing(null);
              }}
            >
              Stop sharing
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );

  function EnvelopeNote() {
    return (
      <div className="mt-3 rounded-xl bg-surface-alt p-4 text-[14px]">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-semibold">Based on your plan and similar sellers</span>
          <AiBadge kind="scripted" />
        </div>
        <ul className="space-y-1 text-ink-body">
          <li>
            {env.volume_multiple_min}× to {env.volume_multiple_max}× your usual orders
          </li>
          <li>{env.shape === "value_led" ? "Bigger baskets than usual" : "More orders, similar basket size"}</li>
          <li>About {env.expected_coupon_pct}% of orders using your offer</li>
          <li>{env.expected_timing}</li>
        </ul>
        <p className="mt-2 text-[13px] text-ink-muted">{env.note}</p>
      </div>
    );
  }
}

import { useState, type ReactNode } from "react";
import { coverage, useCase } from "../state/store";
import type { Declaration, ProfileSource, SourceStatus } from "../lib/types";
import { AiBadge, Button, Card, Chip, Eyebrow, Modal, Stat, TRUST_TONE } from "../components/ui";
import { fmtDate, lakh } from "../shared/format";

const STATUS: Record<SourceStatus, string> = {
  shared: "Shared",
  not_shared: "Not shared",
  withdrawn: "Consent withdrawn",
  always_on: "Always on",
};

const EMPTY: Declaration = {
  sale_name: "",
  start: "2026-10-24",
  end: "2026-10-31",
  offer_text: "",
  expected_daily_orders_min: 0,
  expected_daily_orders_max: 0,
  influencer_plan: "",
};

function Input({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="text-[11px] font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "mt-0.5 w-full rounded-sm border border-line px-2 py-1.5 text-[13px] outline-none focus:border-brand disabled:bg-surface-alt disabled:text-ink-body";

export default function DeclareScreen() {
  const { scenario: s, merchant, cs, dispatch, trust, baselineDailyValue } = useCase();
  const [viewing, setViewing] = useState<ProfileSource | null>(null);
  const [withdrawing, setWithdrawing] = useState<ProfileSource | "all" | null>(null);
  const cov = coverage(merchant);
  const d = cs.declaration;
  const locked = cs.declarationStatus === "submitted";
  const set = (k: keyof Declaration, v: string | number) => d && dispatch({ type: "declChange", declaration: { ...d, [k]: v } });
  const env = s.envelope;
  const multiple = Math.min(env.volume_multiple_max, s.category_ceiling_multiple);
  const preclear = baselineDailyValue * multiple;
  const optionalShared = merchant.sources.some((x) => x.withdrawable && x.status === "shared");

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr_340px]">
      {/* Merchant card */}
      <div className="space-y-4">
        <Card>
          <Eyebrow>Merchant</Eyebrow>
          <h1 className="font-display text-2xl font-semibold">{merchant.name}</h1>
          <p className="mt-0.5 text-[13px] text-ink-body">
            {merchant.category} · {merchant.city}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Days on Razorpay" value={s.history.days_on_razorpay} />
            <Stat label="Incorporated" value={merchant.incorporated} />
          </div>
          <div className="mt-4 rounded-md bg-surface-alt p-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-ink-muted">Trust level</span>
              <Chip tone={TRUST_TONE[trust]}>{trust}</Chip>
            </div>
            <div className="mt-1 text-[12px] text-ink-body">
              {s.history.clean_delivered_orders.toLocaleString("en-IN")} clean delivered orders, dispute rate {s.history.dispute_rate_pct}%
            </div>
            <div className="mt-1 text-[11px] text-ink-muted">Trust grows with every delivered order. It lightens questions during a sale.</div>
          </div>
        </Card>

        <div className="rounded-md bg-stage p-4 text-white">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-stage-text">Why declare?</div>
          <p className="mt-1 text-[12px] leading-relaxed text-white/85">
            A declared sale tells us what to expect. Orders inside your plan settle on time. If something unusual shows up, we'll ask one plain question instead of holding everything.
          </p>
        </div>
      </div>

      {/* Declaration form */}
      <Card
        title="Sale declaration"
        right={
          <span className="flex items-center gap-2">
            {cs.declarationStatus === "submitted" && <Chip tone="positive">Declared</Chip>}
            {cs.declarationStatus === "draft" && <Chip>Draft</Chip>}
            <Button variant="ghost" onClick={() => dispatch({ type: "screen", screen: "spike" })}>
              Next: spike →
            </Button>
          </span>
        }
      >
        {cs.declarationStatus === "none" || !d ? (
          <div className="py-6 text-center">
            <div className="font-display text-lg font-semibold">No sale declared</div>
            <div className="mx-auto mt-3 max-w-md rounded-md border border-brand/30 bg-brand-wash p-4 text-left">
              <div className="font-display text-[14px] font-semibold text-brand-dark">Planning a sale? Declare it to keep settlements moving.</div>
              <p className="mt-1 text-[12px] text-ink-body">Tell us the dates, the offer and roughly how many orders you expect. It takes a minute.</p>
              <Button className="mt-3" onClick={() => dispatch({ type: "declEdit", declaration: { ...EMPTY } })}>
                Declare a sale
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Sale name" wide>
                <input className={inputCls} disabled={locked} value={d.sale_name} onChange={(e) => set("sale_name", e.target.value)} />
              </Input>
              <Input label="Start date">
                <input type="date" className={inputCls} disabled={locked} value={d.start} onChange={(e) => set("start", e.target.value)} />
              </Input>
              <Input label="End date">
                <input type="date" className={inputCls} disabled={locked} value={d.end} onChange={(e) => set("end", e.target.value)} />
              </Input>
              <Input label="Offer link or text" wide>
                <textarea className={`${inputCls} h-14`} disabled={locked} value={d.offer_text} onChange={(e) => set("offer_text", e.target.value)} />
              </Input>
              <Input label="Expected daily orders: min">
                <input type="number" min={0} className={inputCls} disabled={locked} value={d.expected_daily_orders_min} onChange={(e) => set("expected_daily_orders_min", Number(e.target.value))} />
              </Input>
              <Input label="Expected daily orders: max">
                <input type="number" min={0} className={inputCls} disabled={locked} value={d.expected_daily_orders_max} onChange={(e) => set("expected_daily_orders_max", Number(e.target.value))} />
              </Input>
              <Input label="Influencer plan (optional)" wide>
                <input className={inputCls} disabled={locked} value={d.influencer_plan} onChange={(e) => set("influencer_plan", e.target.value)} placeholder="e.g. Reel with a creator on launch day" />
              </Input>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => dispatch({ type: "declSubmit" })} disabled={locked || !d.sale_name.trim()}>
                Submit declaration
              </Button>
              <Button variant="secondary" onClick={() => dispatch({ type: "declEdit" })} disabled={!locked}>
                Edit
              </Button>
              <Button variant="danger" onClick={() => setWithdrawing("all")} disabled={!optionalShared}>
                Stop sharing
              </Button>
            </div>
            {cs.declarationStatus === "submitted" && (
              <div className="mt-4 rounded-md bg-positive-wash px-3 py-2 text-[13px] text-ink">
                Pre-cleared up to <b>{lakh(preclear)}</b> per day for {fmtDate(d.start)} to {fmtDate(d.end)}.
              </div>
            )}
          </>
        )}
      </Card>

      {/* Consent + envelope */}
      <div className="space-y-4">
        <Card title="Data for this sale's review" right={<span className="text-[12px] text-ink-body">{cov.shared} of {cov.total} sources shared</span>}>
          <p className="mb-2 text-[11px] text-ink-muted">Used only for settlement review of this sale.</p>
          <ul className="divide-y divide-line/70">
            {merchant.sources.map((src) => {
              const off = src.status === "withdrawn" || src.status === "not_shared";
              return (
                <li key={src.id} className={`py-2.5 ${src.status === "withdrawn" ? "opacity-45 grayscale" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold">{src.name}</div>
                      <div className="text-[11px] text-ink-muted">
                        {src.via} · {STATUS[src.status]}
                      </div>
                      {src.helper && <div className="text-[11px] text-ink-body">{src.helper}</div>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="secondary" className="!px-2 !py-1 !text-[12px]" onClick={() => setViewing(src)} disabled={off}>
                        View
                      </Button>
                      {src.withdrawable && (
                        <Button variant="danger" className="!px-2 !py-1 !text-[12px]" onClick={() => setWithdrawing(src)} disabled={off}>
                          Withdraw
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Expected envelope" right={<AiBadge kind="scripted" />}>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
            <div>
              <dt className="text-ink-muted">Volume</dt>
              <dd className="font-semibold">
                {env.volume_multiple_min}× to {env.volume_multiple_max}× usual
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Order value shape</dt>
              <dd className="font-semibold">{env.shape === "value_led" ? "Value-led" : "Count-led"}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Expected coupon use</dt>
              <dd className="font-semibold">{env.expected_coupon_pct}%</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Timing</dt>
              <dd className="font-semibold">{env.expected_timing}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-ink-muted">{env.note}</p>
        </Card>
      </div>

      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)}>
          <div className="mb-3 text-[12px] text-ink-muted">
            {viewing.via}
            {viewing.pulledOn ? ` · pulled ${fmtDate(viewing.pulledOn)}` : ""}
          </div>
          <dl className="divide-y divide-line/70 text-[13px]">
            {viewing.details.map((x) => (
              <div key={x.label} className="flex justify-between gap-4 py-2">
                <dt className="text-ink-muted">{x.label}</dt>
                <dd className="text-right font-medium">{x.value}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}

      {withdrawing && (
        <Modal title={withdrawing === "all" ? "Stop sharing?" : "Withdraw consent?"} onClose={() => setWithdrawing(null)}>
          <p className="text-[13px] leading-relaxed text-ink-body">
            {withdrawing === "all" ? (
              <>We'll stop using every optional source for this sale and delete what we pulled. Razorpay order history stays, as it's needed to settle payments.</>
            ) : (
              <>
                We'll stop using <b>{withdrawing.name}</b> and delete the data pulled from {withdrawing.via}. Reviews during the sale may need more questions.
              </>
            )}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setWithdrawing(null)}>
              Keep sharing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (withdrawing === "all") dispatch({ type: "stopSharing" });
                else dispatch({ type: "withdraw", source: withdrawing.id });
                setWithdrawing(null);
              }}
            >
              {withdrawing === "all" ? "Stop sharing" : "Withdraw and delete"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

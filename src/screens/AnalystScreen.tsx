import { useEffect, type ReactNode } from "react";
import { useCase } from "../state/store";
import { AiBadge, Card, Chip, LABEL_META } from "../components/ui";
import { OrderValueHistogram, Sparkline, VolumeChart } from "../components/charts";
import { inr } from "../lib/features";
import { hourLabel } from "../lib/scenarios";
import type { CardId, Evidence } from "../lib/types";
import ReviewPanel from "./ReviewPanel";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function EvidenceTags({ evidence, card }: { evidence: Evidence[]; card: CardId }) {
  return (
    <span className="flex gap-1">
      {evidence
        .filter((e) => e.card === card)
        .map((e) => (
          <span key={e.id} className="rounded-sm bg-surface-alt-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-muted" title={e.text}>
            {e.id}
          </span>
        ))}
    </span>
  );
}

function Meter({ value, tone = "brand", marker }: { value: number; tone?: "brand" | "danger" | "positive" | "warn"; marker?: number }) {
  const bg = { brand: "bg-brand", danger: "bg-danger", positive: "bg-positive", warn: "bg-warn" }[tone];
  return (
    <div className="relative h-2 w-full rounded-full bg-surface-alt-2">
      <div className={`h-2 rounded-full ${bg}`} style={{ width: `${Math.min(100, value * 100)}%` }} />
      {marker !== undefined && <div className="absolute -top-1 h-4 w-0.5 bg-ink" style={{ left: `${marker * 100}%` }} title={`Threshold ${marker}`} />}
    </div>
  );
}

export default function AnalystScreen() {
  const { scenario: s, merchant, features: f, evidence, cs, state, dispatch } = useCase();
  const hl = state.highlight;
  const card = (id: CardId, title: ReactNode, children: ReactNode, extra?: ReactNode) => (
    <Card id={`card-${id}`} highlighted={hl === id} title={title} right={<span className="flex items-center gap-2">{extra}<EvidenceTags evidence={evidence} card={id} /></span>}>
      {children}
    </Card>
  );

  useEffect(() => {
    if (!hl) return;
    document.getElementById(`card-${hl}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const t = setTimeout(() => dispatch({ type: "highlight", card: null }), 2500);
    return () => clearTimeout(t);
  }, [hl, dispatch]);

  const complaints = s.social.posts.filter((p) => p.kind === "complaint");
  const firstMention = s.social.posts.find((p) => p.kind === "mention");

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr_440px]">
      {/* Left: charts */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold">{merchant.name}</h1>
            <div className="text-[12px] text-ink-muted">
              {merchant.category} · {s.history.days_on_razorpay} days on Razorpay · flagged {f.trigger_hour !== null ? hourLabel(s, f.trigger_hour + 2, true) : "n/a"}
            </div>
          </div>
          <Chip tone={cs.declarationStatus === "submitted" ? "brand" : "neutral"}>{cs.declarationStatus === "submitted" ? "Sale declared" : "No sale declared"}</Chip>
        </div>
        {card(
          "volume",
          "Hourly orders vs baseline",
          <>
            <VolumeChart s={s} height={170} />
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
              <span>
                <b className="text-brand">{f.volume_multiple}x</b> baseline
              </span>
              <span className="text-ink-muted">Baseline: {s.baseline.source === "account_aggregator" ? "AA history (14 mo)" : "category peer median"}</span>
              <span className="text-ink-muted">Trigger: 3x for 3h {f.trigger_fired ? "fired" : "not fired"}</span>
            </div>
          </>,
        )}
        {card(
          "histogram",
          "Order value spread: baseline vs spike",
          <>
            <OrderValueHistogram s={s} height={175} />
            <div className="mt-1 grid grid-cols-3 gap-2 text-[12px]">
              <div>
                <div className="text-ink-muted">Avg order value</div>
                <b>
                  {inr(f.aov_baseline)} → {inr(f.aov_spike)}
                </b>
                {f.aov_spike_ex_patterns !== f.aov_spike && <div className="text-[11px] text-ink-muted">{inr(f.aov_spike_ex_patterns)} without the flagged pattern</div>}
              </div>
              <div>
                <div className="text-ink-muted">Shift score (KS)</div>
                <b>{f.distribution_shift_score}</b>
              </div>
              <div>
                <div className="text-ink-muted">Separate cluster</div>
                <b className={f.separate_cluster ? "text-danger" : "text-positive"}>
                  {f.separate_cluster ? `${f.cluster_orders} orders, ${inr(f.cluster_range![0] / 1000)}k–${inr(f.cluster_range![1] / 1000)}k` : "None"}
                </b>
              </div>
            </div>
          </>,
        )}
      </div>

      {/* Middle: signal cards */}
      <div className="space-y-3">
        {card(
          "category",
          "Category context",
          <div className="text-[12px]">
            <div className="mb-1 flex items-center gap-2">
              <b className="text-[13px]">{s.category.name}</b>
              <Chip tone="brand">{s.category.driver === "order_value" ? "Order value led" : "Order count led"}</Chip>
            </div>
            <p className="text-ink-body">{s.category.expected}</p>
            <p className="mt-1.5 text-ink-muted">
              Observed: order value {f.aov_shift_pct > 0 ? "+" : ""}
              {f.aov_shift_pct}%, order count {f.volume_multiple}x{f.separate_cluster ? ", lift concentrated in one high-value block" : ", whole range shifted"}.
            </p>
          </div>,
        )}
        {card(
          "offer",
          "Website offer vs checkout coupons",
          s.offer ? (
            <div className="grid grid-cols-[1fr_120px] gap-4 text-[12px]">
              <div>
                <div className="rounded-sm border border-line bg-surface-alt px-2 py-1.5 font-medium">"{s.offer.text}"</div>
                <div className="mt-1 text-ink-muted">
                  {s.offer.url} · live from {hourLabel(s, s.offer.startHour, true)} ({f.offer_started_hours_before_spike === 0 ? "spike start" : `${f.offer_started_hours_before_spike}h before spike`})
                </div>
              </div>
              <div>
                <div className="text-ink-muted">{s.offer.code} used</div>
                <div className={`font-display text-2xl font-semibold ${f.coupon_match_rate! >= 0.6 ? "text-positive" : "text-danger"}`}>{pct(f.coupon_match_rate!)}</div>
                <Meter value={f.coupon_match_rate!} tone={f.coupon_match_rate! >= 0.6 ? "positive" : "danger"} />
              </div>
            </div>
          ) : (
            <div className="text-[12px] text-ink-muted">No offer found on the website at scan time. No coupon codes used at checkout.</div>
          ),
        )}
        {card(
          "social",
          "Social signal",
          <div className="grid grid-cols-[1fr_130px] gap-4 text-[12px]">
            <div>
              <Sparkline values={s.social.mentionsPerHour} markAt={s.spikeStartHour} />
              <div className="mt-0.5 text-ink-muted">Mentions per hour, 96h. Dashed line: spike start.</div>
              {firstMention && <div className="mt-1 line-clamp-2 text-ink-body">{firstMention.text}</div>}
            </div>
            <div className="space-y-1.5">
              <div>
                <div className="text-ink-muted">Mentions vs volume</div>
                <b>{f.social_lead_hours === null ? "No surge" : `Led by ${f.social_lead_hours}h`}</b>
              </div>
              <div>
                <div className="text-ink-muted">Complaints</div>
                <b className={f.never_received_count ? "text-danger" : complaints.length > 3 ? "text-warn" : ""}>
                  {complaints.length}
                  {f.never_received_count ? ` (${f.never_received_count} "never received")` : complaints.length ? " (delivery delay)" : ""}
                </b>
              </div>
            </div>
          </div>,
        )}
        {card(
          "customers",
          "Customer mix",
          <div className="grid grid-cols-2 gap-4 text-[12px]">
            <div>
              <div className="text-ink-muted">New customers in spike</div>
              <div className="font-display text-2xl font-semibold">{pct(f.new_customer_share)}</div>
              <Meter value={f.new_customer_share} />
            </div>
            <div>
              <div className="text-ink-muted">Repeated cards / devices</div>
              <div className={`font-display text-2xl font-semibold ${f.repeated_cards ? "text-danger" : "text-positive"}`}>
                {f.repeated_cards} / {f.repeated_devices}
              </div>
              <div className="text-ink-muted">{f.repeated_cards ? `${pct(f.repeated_card_share)} of the high-value cluster` : f.repeated_devices ? "No card clusters; 1 device behind the flagged pattern" : "No clusters among new customers"}</div>
            </div>
          </div>,
        )}
        <JudgmentCard />
      </div>

      {/* Right: pattern review */}
      <ReviewPanel />
    </div>
  );
}

/** The v0.1 spike judgment, kept as pre-written context. It no longer moves money. */
function JudgmentCard() {
  const { judgment: j, evidence, dispatch } = useCase();
  const valid = new Set(evidence.map((e) => e.id));
  const reasons = j.reasons.filter((r) => r.evidence_ids.length > 0 && r.evidence_ids.every((id) => valid.has(id)));
  return (
    <Card title="Spike judgment" right={<AiBadge kind="scripted" />}>
      <div className="flex items-center gap-3">
        <Chip tone={LABEL_META[j.label].tone} className="!px-3 !py-1 !text-[13px]">
          {LABEL_META[j.label].text}
        </Chip>
        <div className="flex-1">
          <div className="flex justify-between text-[11px] text-ink-muted">
            <span>Confidence</span>
            <b className="text-ink">{j.confidence.toFixed(2)}</b>
          </div>
          <Meter value={j.confidence} />
        </div>
      </div>
      <ol className="mt-2 space-y-1.5">
        {reasons.map((r, i) => (
          <li key={i} className="flex gap-2 text-[12px] leading-snug">
            <span className="mt-0.5 text-ink-subtle">{i + 1}.</span>
            <span>
              {r.text}{" "}
              {r.evidence_ids.map((id) => (
                <button
                  key={id}
                  onClick={() => dispatch({ type: "highlight", card: evidence.find((e) => e.id === id)!.card })}
                  className="ml-0.5 rounded-sm bg-brand-wash px-1 py-px font-mono text-[10px] font-semibold text-brand-dark hover:bg-brand hover:text-white"
                  title={evidence.find((e) => e.id === id)?.text}
                >
                  {id}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-ink-muted">Context only. Amounts come from the pattern review.</p>
    </Card>
  );
}

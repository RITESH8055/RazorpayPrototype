import { useEffect, useState, type ReactNode } from "react";
import { useCase } from "../state/store";
import { ACTION_TEXT, Button, Card, Chip, LABEL_META } from "../components/ui";
import { OrderValueHistogram, Sparkline, VolumeChart } from "../components/charts";
import { inr } from "../lib/features";
import { hourLabel } from "../lib/scenarios";
import { runAnalysis } from "../lib/analysis";
import { MAX_RELEASE_PCT, MIN_CONFIDENCE } from "../lib/guardrails";
import type { CardId, Decision, Evidence, FinalAction } from "../lib/types";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export const OVERRIDE_REASONS = [
  "Social signal weighted too high for this category",
  "Offer and coupon evidence misread",
  "Merchant evidence received outside the pack",
  "Model too lenient: fraud indicators missed",
  "Model too strict: category pattern is normal",
  "Other",
];

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
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr_400px]">
      {/* Left: charts */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold">{merchant.name}</h1>
            <div className="text-[12px] text-ink-muted">
              {merchant.category} · {merchant.daysOnRazorpay} days on Razorpay · flagged {f.trigger_hour !== null ? hourLabel(s, f.trigger_hour + 2, true) : "n/a"}
            </div>
          </div>
          <Chip tone={cs.packStatus === "shared" ? "positive" : "neutral"}>
            Merchant pack: {cs.packStatus === "shared" ? "shared" : cs.packStatus === "stopped" ? "sharing stopped" : "not shared"}
          </Chip>
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
              <div className="text-ink-muted">{f.repeated_cards ? `${pct(f.repeated_card_share)} of the high-value cluster` : "No clusters among new customers"}</div>
            </div>
          </div>,
        )}
      </div>

      {/* Right: AI recommendation */}
      <RecommendationPanel />
    </div>
  );
}

function RecommendationPanel() {
  const { scenario: s, merchant, features, evidence, cs, dispatch, fallback } = useCase();
  const [mode, setMode] = useState<"none" | "modify" | "override">("none");
  const a = cs.analysis;
  const rec = a?.recommendation;

  const [releasePct, setReleasePct] = useState(80);
  const [reserveDays, setReserveDays] = useState(30);
  const [ovAction, setOvAction] = useState<FinalAction>("hold");
  const [ovReason, setOvReason] = useState("");
  const [ovNote, setOvNote] = useState("");

  useEffect(() => {
    setMode("none");
    if (rec) {
      setReleasePct(rec.recommended_action === "partial_release" ? rec.partial_release_pct : 0);
      setReserveDays(rec.reserve_days);
    }
  }, [rec, s.id]);

  const run = async () => {
    dispatch({ type: "running" });
    const result = await runAnalysis(features, evidence, merchant, fallback);
    dispatch({ type: "analysis", result });
  };

  const decide = (kind: Decision["kind"]) => {
    if (!rec || !a) return;
    let action: FinalAction = rec.recommended_action;
    let pctOut = rec.partial_release_pct;
    let days = rec.reserve_days;
    if (kind === "modify") {
      pctOut = releasePct;
      days = reserveDays;
      action = releasePct > 0 ? "partial_release" : rec.recommended_action === "partial_release" ? "hold" : rec.recommended_action;
    }
    if (kind === "override") {
      action = ovAction;
      pctOut = ovAction === "full_release" ? 100 : ovAction === "partial_release" ? releasePct : 0;
      days = ovAction === "full_release" ? 0 : reserveDays;
    }
    const decision: Decision = {
      kind,
      action,
      releasePct: pctOut,
      reserveDays: days,
      overrideReason: kind === "override" ? ovReason : undefined,
      overrideNote: kind === "override" ? ovNote.trim() : undefined,
      aiLabel: rec.label,
      aiAction: rec.recommended_action,
      aiSource: a.source,
      decidedBy: "Risk analyst (you)",
      secondsToDecision: Math.max(1, Math.round((Date.now() - cs.openedAt) / 1000)),
      at: new Date().toISOString(),
    };
    const learning =
      kind === "approve"
        ? s.learning.approve
        : kind === "modify"
          ? `${s.learning.modify} (release ${pctOut}%, reserve ${days} days)`
          : `Analyst override recorded: ${ovReason.charAt(0).toLowerCase() + ovReason.slice(1)}${ovNote.trim() ? `. "${ovNote.trim()}"` : ""}. Signals cited for this ${LABEL_META[rec.label].text.toLowerCase()} case down-weighted for ${s.category.name.toLowerCase()}.`;
    dispatch({ type: "decide", decision, learning });
  };

  const highlight = (id: string) => {
    const ev = evidence.find((e) => e.id === id);
    if (ev) dispatch({ type: "highlight", card: ev.card });
  };

  return (
    <div className="xl:sticky xl:top-0 xl:self-start">
      <Card
        title="AI recommendation"
        right={
          a && (
            <span className="flex items-center gap-1.5" title={a.fallbackReason}>
              <Chip tone={a.source === "live" ? "positive" : "warn"}>{a.source === "live" ? "Live" : "Fallback"}</Chip>
              <span className="text-[10px] text-ink-subtle">{(a.latencyMs / 1000).toFixed(1)}s</span>
            </span>
          )
        }
      >
        {!a && (
          <div className="py-2 text-[12px] text-ink-body">
            <p>
              Sends the {Object.keys(features).length} computed features and {evidence.length} evidence snippets to the model. The model returns a label, confidence, cited reasons and a recommended action. Code then applies the guardrails.
            </p>
            <ul className="mt-2 space-y-0.5 text-ink-muted">
              <li>• Never full release; release capped at {MAX_RELEASE_PCT}%</li>
              <li>• Confidence below {MIN_CONFIDENCE} forces hold and request</li>
              <li>• Reasons without valid evidence IDs are dropped</li>
            </ul>
          </div>
        )}

        <Button className="mt-1 w-full" onClick={run} disabled={cs.running} variant={a ? "secondary" : "primary"}>
          {cs.running ? (
            <>
              <span className="spinner" style={a ? { borderColor: "#CCD7EB", borderTopColor: "#305EFF" } : undefined} /> Analysing…
            </>
          ) : a ? (
            "Re-run analysis"
          ) : (
            "Run analysis"
          )}
        </Button>
        {a?.source === "fallback" && <div className="mt-1 text-center text-[10px] text-ink-subtle">Scripted result loaded: {a.fallbackReason}</div>}

        {rec && a && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-3">
              <Chip tone={LABEL_META[rec.label].tone} className="!px-3 !py-1 !text-[13px]">
                {LABEL_META[rec.label].text}
              </Chip>
              <div className="flex-1">
                <div className="flex justify-between text-[11px] text-ink-muted">
                  <span>Confidence</span>
                  <b className="text-ink">{rec.confidence.toFixed(2)}</b>
                </div>
                <Meter value={rec.confidence} marker={MIN_CONFIDENCE} tone={rec.confidence < MIN_CONFIDENCE ? "warn" : "brand"} />
              </div>
            </div>

            {a.insufficientEvidence && <div className="rounded-sm bg-warn-wash px-2 py-1.5 text-[12px] font-semibold text-warn">Insufficient evidence: routed to analyst with hold and request.</div>}

            <ol className="space-y-1.5">
              {rec.reasons.map((r, i) => (
                <li key={i} className="flex gap-2 text-[12px] leading-snug">
                  <span className="mt-0.5 text-ink-subtle">{i + 1}.</span>
                  <span>
                    {r.text}{" "}
                    {r.evidence_ids.map((id) => (
                      <button
                        key={id}
                        onClick={() => highlight(id)}
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

            <div className="rounded-md bg-surface-alt p-3">
              <div className="text-[11px] text-ink-muted">Recommended action</div>
              <div className="font-display text-[15px] font-semibold">
                {ACTION_TEXT[rec.recommended_action]}
                {rec.recommended_action === "partial_release" && (
                  <span className="text-brand">
                    {" "}
                    {rec.partial_release_pct}% now · {100 - rec.partial_release_pct}% reserve for {rec.reserve_days} days
                  </span>
                )}
              </div>
              {rec.evidence_requests.length > 0 && (
                <div className="mt-1.5">
                  <div className="text-[11px] text-ink-muted">Request from merchant (analyst only)</div>
                  <ul className="mt-0.5 list-disc pl-4 text-[12px]">
                    {rec.evidence_requests.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-1.5 text-[11px] text-ink-muted">
                Merchant sees: <span className="text-ink-body">{rec.label === "explained" ? "outlook message" : "general warning only"}</span>
              </div>
            </div>

            {a.flags.length > 0 && (
              <details className="text-[11px] text-ink-muted">
                <summary className="cursor-pointer font-semibold">
                  {a.flags.length} guardrail{a.flags.length > 1 ? "s" : ""} applied in code
                </summary>
                <ul className="mt-1 space-y-0.5">
                  {a.flags.map((fl, i) => (
                    <li key={i}>
                      <b>{fl.rule}:</b> {fl.detail}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {cs.decision ? (
              <div className="flex items-center justify-between rounded-md border border-positive/30 bg-positive-wash px-3 py-2 text-[12px]">
                <span>
                  Decided: <b>{cs.decision.kind}</b> · {ACTION_TEXT[cs.decision.action]}
                </span>
                <Button variant="ghost" onClick={() => dispatch({ type: "screen", screen: "outcome" })}>
                  Outcome →
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Button onClick={() => decide("approve")}>Approve</Button>
                  <Button variant="secondary" onClick={() => setMode(mode === "modify" ? "none" : "modify")}>
                    Modify
                  </Button>
                  <Button variant="secondary" onClick={() => setMode(mode === "override" ? "none" : "override")}>
                    Override
                  </Button>
                </div>

                {mode === "modify" && (
                  <div className="space-y-2 rounded-md border border-line p-3 text-[12px]">
                    <label className="block">
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Release now</span>
                        <b>{releasePct}%</b>
                      </div>
                      <input type="range" min={0} max={MAX_RELEASE_PCT} step={5} value={releasePct} onChange={(e) => setReleasePct(+e.target.value)} className="w-full accent-[#305EFF]" />
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-ink-muted">Reserve days</span>
                      <input type="number" min={0} max={180} value={reserveDays} onChange={(e) => setReserveDays(Math.max(0, +e.target.value))} className="w-20 rounded-sm border border-line px-2 py-1 text-right" />
                    </label>
                    <Button className="w-full" onClick={() => decide("modify")}>
                      Confirm modified decision
                    </Button>
                  </div>
                )}

                {mode === "override" && (
                  <div className="space-y-2 rounded-md border border-line p-3 text-[12px]">
                    <label className="block">
                      <span className="text-ink-muted">Your decision</span>
                      <select value={ovAction} onChange={(e) => setOvAction(e.target.value as FinalAction)} className="mt-0.5 w-full rounded-sm border border-line px-2 py-1">
                        <option value="full_release">Full release (analyst only)</option>
                        <option value="partial_release">Partial release</option>
                        <option value="hold_and_request">Hold and request evidence</option>
                        <option value="hold">Hold</option>
                      </select>
                    </label>
                    {ovAction === "partial_release" && (
                      <label className="block">
                        <div className="flex justify-between">
                          <span className="text-ink-muted">Release now</span>
                          <b>{releasePct}%</b>
                        </div>
                        <input type="range" min={0} max={100} step={5} value={releasePct} onChange={(e) => setReleasePct(+e.target.value)} className="w-full accent-[#305EFF]" />
                      </label>
                    )}
                    <label className="block">
                      <span className="text-ink-muted">Reason (required)</span>
                      <select value={ovReason} onChange={(e) => setOvReason(e.target.value)} className="mt-0.5 w-full rounded-sm border border-line px-2 py-1">
                        <option value="">Select a reason…</option>
                        {OVERRIDE_REASONS.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </label>
                    <textarea
                      value={ovNote}
                      onChange={(e) => setOvNote(e.target.value)}
                      placeholder="Explain the override (required)"
                      className="h-14 w-full rounded-sm border border-line p-2 outline-none focus:border-brand"
                    />
                    <Button className="w-full" disabled={!ovReason || !ovNote.trim()} onClick={() => decide("override")}>
                      Record override
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

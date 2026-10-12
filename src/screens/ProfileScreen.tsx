import { useState } from "react";
import { readiness, useCase } from "../state/store";
import type { ProfileSource, SourceStatus } from "../lib/types";
import { Button, Card, Chip, Eyebrow, Modal, Stat } from "../components/ui";
import { inr } from "../lib/features";

const STATUS: Record<SourceStatus, { text: string; tone: "positive" | "brand" | "neutral" | "warn" | "danger" }> = {
  verified: { text: "Verified", tone: "positive" },
  consented: { text: "Consented", tone: "brand" },
  not_consented: { text: "Not consented", tone: "neutral" },
  withdrawn: { text: "Consent withdrawn", tone: "danger" },
  pending_reverification: { text: "Correction: re-verifying", tone: "warn" },
};

const READY_TONE = { Ready: "positive", "Partly ready": "warn", "Not ready": "danger" } as const;

const ICONS: Record<string, string> = { mca: "MCA", gst: "GST", bank: "AA", razorpay: "PAY" };

export default function ProfileScreen() {
  const { merchant, cs, dispatch, scenario } = useCase();
  const [viewing, setViewing] = useState<ProfileSource | null>(null);
  const [correcting, setCorrecting] = useState<ProfileSource | null>(null);
  const [withdrawing, setWithdrawing] = useState<ProfileSource | null>(null);
  const [note, setNote] = useState("");
  const r = readiness(merchant);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <Card>
          <Eyebrow>Merchant</Eyebrow>
          <h1 className="font-display text-2xl font-semibold">{merchant.name}</h1>
          <p className="mt-0.5 text-[13px] text-ink-body">
            {merchant.category} · {merchant.city}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Days on Razorpay" value={merchant.daysOnRazorpay} />
            <Stat label="Incorporated" value={merchant.incorporated} />
            <Stat label="Usual daily sales" value={inr(merchant.usualDailyGmv)} />
            <Stat label="Baseline source" value={scenario.baseline.source === "account_aggregator" ? "AA history" : "Category peers"} />
          </div>
        </Card>

        <Card>
          <div className="text-[12px] font-medium text-ink-muted">Growth readiness</div>
          <div className="mt-1 flex items-center gap-3">
            <Chip tone={READY_TONE[r.level]} className="!px-3 !py-1 !text-[14px]">
              {r.level}
            </Chip>
            <span className="text-[12px] text-ink-muted">
              {r.active} of {r.total} sources active
            </span>
          </div>
          <div className="mt-3 flex gap-1">
            {merchant.sources.map((s) => (
              <span key={s.id} className={`h-1.5 flex-1 rounded-full ${s.status === "verified" || s.status === "consented" ? "bg-brand" : "bg-surface-alt-2"}`} />
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-body">
            Built in the background after onboarding. If a sale spikes, these verified sources go into a readiness pack you control, so settlements can keep moving.
          </p>
        </Card>

        <div className="rounded-md bg-stage p-4 text-white">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-stage-text">Your data, your call</div>
          <p className="mt-1 text-[12px] leading-relaxed text-white/85">
            Consent is per source and only for "growth readiness and settlement risk review". Account Aggregator data consented for lending is never reused. Withdrawing deletes AA data.
          </p>
        </div>
      </div>

      <Card
        title="Profile sources"
        right={
          <Button variant="ghost" onClick={() => dispatch({ type: "screen", screen: "spike" })}>
            Next: spike alert →
          </Button>
        }
      >
        <ul className="divide-y divide-line/70">
          {merchant.sources.map((s) => {
            const st = STATUS[s.status];
            const inactive = s.status === "withdrawn" || s.status === "not_consented";
            return (
              <li key={s.id} className={`flex flex-wrap items-center gap-4 py-3.5 ${s.status === "withdrawn" ? "opacity-45 grayscale" : ""}`}>
                <div className="grid h-10 w-10 place-items-center rounded-md bg-brand-wash font-display text-[10px] font-bold text-brand-dark" aria-hidden>
                  {ICONS[s.id]}
                </div>
                <div className="min-w-[220px] flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[14px] font-semibold">{s.name}</span>
                    <Chip tone={st.tone}>{st.text}</Chip>
                  </div>
                  <div className="text-[12px] text-ink-muted">
                    {s.via}
                    {s.pulledOn && s.status !== "withdrawn" ? ` · pulled ${new Date(s.pulledOn).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                  </div>
                  {s.id === "razorpay" && s.status !== "withdrawn" && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {s.details.slice(0, 3).map((d) => (
                        <Chip key={d.label}>
                          {d.label}: {d.value}
                        </Chip>
                      ))}
                    </div>
                  )}
                  {cs.corrections[s.id] && <div className="mt-1 text-[11px] text-warn">Your correction: "{cs.corrections[s.id]}"</div>}
                </div>
                <div className="flex gap-1.5">
                  <Button variant="secondary" onClick={() => setViewing(s)} disabled={inactive}>
                    View
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setNote("");
                      setCorrecting(s);
                    }}
                    disabled={inactive}
                  >
                    Correct
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => setWithdrawing(s)}
                    disabled={inactive || !s.withdrawable}
                    title={s.withdrawable ? undefined : "Razorpay's own payment records are needed to settle payments"}
                  >
                    Withdraw consent
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)}>
          <div className="mb-3 text-[12px] text-ink-muted">
            {viewing.via} · pulled {viewing.pulledOn}
          </div>
          <dl className="divide-y divide-line/70 text-[13px]">
            {viewing.details.map((d) => (
              <div key={d.label} className="flex justify-between gap-4 py-2">
                <dt className="text-ink-muted">{d.label}</dt>
                <dd className="text-right font-medium">{d.value}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}

      {correcting && (
        <Modal title={`Correct: ${correcting.name}`} onClose={() => setCorrecting(null)}>
          <p className="mb-2 text-[13px] text-ink-body">Tell us what's wrong. The item is flagged for re-verification and left out of readiness until it's checked.</p>
          <textarea
            className="h-24 w-full rounded-sm border border-line p-2 text-[13px] outline-none focus:border-brand"
            placeholder="e.g. Second director was replaced in Aug 2026"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCorrecting(null)}>
              Cancel
            </Button>
            <Button
              disabled={!note.trim()}
              onClick={() => {
                dispatch({ type: "correct", source: correcting.id, note: note.trim() });
                setCorrecting(null);
              }}
            >
              Submit correction
            </Button>
          </div>
        </Modal>
      )}

      {withdrawing && (
        <Modal title="Withdraw consent?" onClose={() => setWithdrawing(null)}>
          <p className="text-[13px] leading-relaxed text-ink-body">
            We'll stop using <b>{withdrawing.name}</b> and delete the data pulled from {withdrawing.via.split(" (")[0]}. Your readiness level may drop, and a spike review could take longer.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setWithdrawing(null)}>
              Keep sharing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                dispatch({ type: "withdraw", source: withdrawing.id });
                setWithdrawing(null);
              }}
            >
              Withdraw and delete
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

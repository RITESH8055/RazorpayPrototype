// "Try to fool it" (PRD v0.3, Part B). Analyst view only. The analyst can edit only the reply
// text; payments, registry and courier data are read-only. Every amount comes from reserve.ts.
import { useMemo, useState } from "react";
import { useCase } from "../state/store";
import { AiBadge, Button, Chip } from "../components/ui";
import { ChecksList, ExtractedTable } from "./ReplyParts";
import { CHECK_SHORT, runChecks } from "../shared/checks";
import { capRevision, reserve, settle } from "../shared/reserve";
import { inr } from "../shared/format";
import { readText, scriptedExtraction } from "../lib/readReply";
import { PRESETS, type PresetContext } from "../lib/foolPresets";
import type { Pattern, ReadResult } from "../lib/types";

const GUARANTEE = "Money moves only when the payer on the payments matches the document.";

interface Attempt {
  read: ReadResult;
  release: number;
  rawRelease: number;
  reserve: number;
  failed: string[];
  breach: boolean;
}

export default function FoolModal({ pattern: p, onClose }: { pattern: Pattern; onClose: () => void }) {
  const { scenario: s, id, cs, trust, dispatch } = useCase();
  const original = s.invoice_fixture?.text_transcript ?? "";
  const [text, setText] = useState(original);
  const [running, setRunning] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);

  // The first answer: the analyst's reading of the locked reply if there is one, else the scripted reading.
  const baseline = useMemo(() => {
    const x = cs.reads[p.id]?.extraction ?? scriptedExtraction(id);
    const run = runChecks(s, p.id, x);
    const st = settle(p, trust, run.matchedValue, run.checks);
    return { x, release: st.release, reserve: st.reserve, failed: run.checks.filter((c) => !c.pass).map((c) => c.name) };
  }, [cs.reads, id, p, s, trust]);

  const ctx: PresetContext = { original, gstin: s.registry_fixture.gstin, buyer: baseline.x.buyer_name.value, total: baseline.x.invoice_total.value, patternValue: p.value };

  const run = async () => {
    setRunning(true);
    const read = await readText(id, text);
    const checks = runChecks(s, p.id, read.extraction);
    const st = settle(p, trust, checks.matchedValue, checks.checks);
    const release = capRevision(st.release, baseline.release);
    const breach = release > baseline.release;
    const failed = checks.checks.filter((c) => !c.pass).map((c) => c.name);
    const next: Attempt = { read, release, rawRelease: st.release, reserve: reserve(p.value - release, st.disc), failed, breach };
    setAttempt(next);
    setRunning(false);
    const reasons = [...failed.map((f) => CHECK_SHORT[f] ?? f), ...(st.release > release ? ["revision capped at first answer"] : []), ...(read.injectionDetected ? ["injection ignored"] : [])];
    dispatch({
      type: "foolAttempt",
      released: Math.max(0, release - baseline.release),
      breach,
      text: breach
        ? `GUARDRAIL BREACH: a fool attempt released ${inr(release - baseline.release)} more than the first answer (${p.label}). Fix before submission.`
        : `Fool attempt blocked (${p.label}): ${reasons.length ? reasons.join(", ") : "no change in release"}.`,
    });
  };

  const verdict = (a: Attempt) => {
    const parts: string[] = [];
    if (a.failed.length) parts.push(`Failed checks: ${a.failed.map((f) => CHECK_SHORT[f] ?? f).join(", ")}.`);
    if (a.rawRelease > a.release) parts.push(`A revised reply can't release more than the first answer; ${inr(a.rawRelease - a.release)} waits for the analyst.`);
    if (a.read.injectionDetected) parts.push("Instructions in the document were ignored.");
    if (!parts.length) parts.push("No extra money released.");
    return `Blocked. ${parts.join(" ")} ${GUARANTEE}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-[1180px] flex-col rounded-md bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Try to fool it">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="font-display text-base font-semibold">Try to fool it</h2>
            <div className="text-[12px] text-ink-muted">Edit the merchant's reply however you like. Payments, registry and courier data stay read-only.</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-ink-body">
              Attempts: <b>{cs.fool.attempts}</b> · Money released by attempts: <b className={cs.fool.released ? "text-danger" : "text-positive"}>{inr(cs.fool.released)}</b>
            </span>
            <button className="text-ink-muted hover:text-ink" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 md:grid-cols-2">
          {/* Left: the reply */}
          <div className="flex min-h-0 flex-col">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {PRESETS.map((pr) => (
                <button
                  key={pr.id}
                  onClick={() => setText((t) => pr.apply(t, ctx))}
                  className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${pr.id === "reset" ? "border-line text-ink-muted hover:text-ink" : "border-brand/40 bg-brand-wash text-brand-dark hover:bg-brand hover:text-white"}`}
                >
                  {pr.label}
                </button>
              ))}
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[260px] flex-1 rounded-sm border border-line p-3 font-mono text-[12px] leading-relaxed outline-none focus:border-brand" aria-label="Reply text" />
            <Button className="mt-2" onClick={run} disabled={running || !text.trim()}>
              {running ? (
                <>
                  <span className="spinner" /> Reading…
                </>
              ) : (
                "Run"
              )}
            </Button>
            <p className="mt-2 text-[11px] text-ink-muted">The guarantee: {GUARANTEE} Editing the text can never change the payment data, so it can never move money on its own.</p>
          </div>

          {/* Right: the result */}
          <div className="min-h-0 overflow-y-auto pr-1">
            {!attempt ? (
              <div className="grid h-full place-items-center rounded-md border border-dashed border-line p-6 text-center text-[13px] text-ink-muted">
                Pick a preset or edit the text, then Run.
                <br />
                First answer: release {inr(baseline.release)}, reserve {inr(baseline.reserve)}.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {attempt.read.source === "live" ? <AiBadge kind="live" /> : <AiBadge kind="fallback" label="Fallback (basic parser)" title={attempt.read.fallbackReason} />}
                  {attempt.read.injectionDetected && <Chip tone="danger">Document contained instructions; ignored.</Chip>}
                </div>

                {attempt.breach ? (
                  <div className="rounded-md bg-danger px-3 py-2 text-[13px] font-semibold text-white">Guardrail breach: this attempt released more than the first answer. Logged as a bug to fix before submission.</div>
                ) : (
                  <div className="rounded-md bg-positive-wash px-3 py-2 text-[13px] text-ink">{verdict(attempt)}</div>
                )}

                <div className="grid grid-cols-3 gap-2 rounded-md bg-surface-alt p-2 text-[12px]">
                  <div />
                  <div className="font-semibold text-ink-muted">First answer</div>
                  <div className="font-semibold text-ink-muted">This attempt</div>
                  <div className="text-ink-muted">Release now</div>
                  <b>{inr(baseline.release)}</b>
                  <b className={attempt.release > baseline.release ? "text-danger" : ""}>{inr(attempt.release)}</b>
                  <div className="text-ink-muted">Reserve</div>
                  <span>{inr(baseline.reserve)}</span>
                  <span>{inr(attempt.reserve)}</span>
                  <div className="text-ink-muted">Checks failed</div>
                  <span>{baseline.failed.length ? baseline.failed.map((f) => CHECK_SHORT[f] ?? f).join(", ") : "none"}</span>
                  <span>{attempt.failed.length ? attempt.failed.map((f) => CHECK_SHORT[f] ?? f).join(", ") : "none"}</span>
                </div>

                <ExtractedTable extraction={attempt.read.extraction} kind={p.kind} />
                <ChecksList checks={runChecks(s, p.id, attempt.read.extraction).checks} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

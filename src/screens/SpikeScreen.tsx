import { useRef, useState } from "react";
import { useCase } from "../state/store";
import { derivePattern, type PatternView } from "../state/derive";
import { AiBadge, Button, Card, Chip } from "../components/ui";
import { VolumeChart } from "../components/charts";
import { fmtDate, inr, lakh } from "../shared/format";
import { urlToDataUrl, type Submission } from "../lib/readReply";

export default function SpikeScreen() {
  const { scenario: s, features: f, cs, trust, spikeValue } = useCase();
  const views = s.patterns.map((p) => derivePattern(s, trust, p, cs.patterns[p.id], cs.reads[p.id], cs.decisions[p.id]));
  const waiting = views.reduce((a, v) => a + v.waiting, 0);
  const stopped = views.reduce((a, v) => a + v.stopped, 0);
  const onTime = spikeValue - waiting - stopped;
  const env = s.envelope;
  const declared = cs.declarationStatus === "submitted";
  const inside = f.volume_multiple >= env.volume_multiple_min && f.volume_multiple <= env.volume_multiple_max;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-md bg-brand px-5 py-4 text-white">
        <div className="font-display text-3xl font-semibold">{f.volume_multiple}×</div>
        <div className="min-w-[280px] flex-1">
          <div className="font-display text-[17px] font-semibold">Your sales are {f.volume_multiple}× your usual level.</div>
          <div className="text-[12px] text-white/80">
            {f.spike_orders} orders in the last 24 hours vs about {f.baseline_orders_per_day} on a usual day
          </div>
        </div>
        <Chip tone={declared && inside ? "accent" : "neutral"}>{!declared ? "No sale declared" : inside ? "Within your declared plan" : "Outside your declared plan"}</Chip>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <Card title="Settlement for this spike">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[12px] text-ink-muted">Settling on time</div>
                <div className="font-display text-2xl font-semibold text-positive">{lakh(onTime)}</div>
              </div>
              <div>
                <div className="text-[12px] text-ink-muted">Waiting on your answers</div>
                <div className="font-display text-2xl font-semibold text-ink">{lakh(waiting)}</div>
              </div>
            </div>
            {stopped > 0 && <div className="mt-2 text-[12px] text-ink-body">Stopped for cancellation review: {lakh(stopped)}</div>}
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-alt-2">
              <div className="h-2 bg-positive" style={{ width: `${(onTime / spikeValue) * 100}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-ink-muted">Only the orders in question wait. Everything else pays out on the usual schedule.</p>
          </Card>

          <Card title="Orders per hour vs your usual level" right={<span className="text-[11px] text-ink-muted">last 48 hours</span>}>
            <VolumeChart s={s} from={48} height={170} />
          </Card>
        </div>

        <div id="questions" className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-[15px] font-semibold">
              {views.length === 1 ? "One question" : `${views.length} questions`} about your orders
            </h2>
            <AiBadge kind="scripted" />
          </div>
          {views.map((v) => (
            <QuestionCard key={v.pattern.id} v={v} />
          ))}
        </div>
      </div>
    </div>
  );
}

function QuestionCard({ v }: { v: PatternView }) {
  const { scenario: s, dispatch } = useCase();
  const p = v.pattern;
  const ps = v.state;
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ url: string; name: string } | undefined>();
  const [shipBy, setShipBy] = useState("2026-10-23");
  const [sample, setSample] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const decided = !!v.decision;

  const submit = (sub: Submission) => {
    dispatch({ type: "answer", pattern: p.id, submission: sub });
    setComposing(false);
  };
  const loadSample = async () => {
    const fx = s.invoice_fixture;
    if (!fx) return;
    setSample(true);
    setText(fx.text_transcript);
    if (fx.image_path) setFile({ url: await urlToDataUrl(fx.image_path), name: fx.image_path.split("/").pop()! });
  };
  const onFile = (fl: File | undefined) => {
    if (!fl) return;
    const fr = new FileReader();
    fr.onload = () => setFile({ url: String(fr.result), name: fl.name });
    fr.readAsDataURL(fl);
    setSample(false);
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-[15px] font-semibold leading-snug">{p.question_for_merchant}</p>
        <span className="shrink-0 rounded-sm bg-surface-alt px-2 py-1 text-[12px] font-semibold">{lakh(p.value)}</span>
      </div>

      {decided ? (
        <DecidedLines v={v} />
      ) : ps.status === "submitted" && !composing ? (
        <div className="mt-3 rounded-md bg-positive-wash px-3 py-2 text-[13px]">
          <b>Submitted.</b> A reviewer will confirm shortly.
          {ps.submission?.fileName && <span className="text-ink-muted"> · {ps.submission.fileName}</span>}
          <button className="ml-2 text-[12px] font-semibold text-brand-dark underline" onClick={() => setComposing(true)}>
            Edit
          </button>
          {ps.edited && <div className="mt-1 text-[11px] text-ink-muted">You edited this answer; the reviewer can see both versions.</div>}
        </div>
      ) : ps.status === "not_recognised" ? (
        <div className="mt-3 rounded-md bg-surface-alt px-3 py-2 text-[13px]">Thanks. We'll stop these from settling and you can cancel before shipping.</div>
      ) : composing ? (
        p.kind === "capacity" ? (
          <div className="mt-3 space-y-2 rounded-md border border-line p-3 text-[13px]">
            <label className="flex items-center gap-2">
              Ship all remaining orders by
              <input type="date" value={shipBy} onChange={(e) => setShipBy(e.target.value)} className="rounded-sm border border-line px-2 py-1" />
            </label>
            <Button
              onClick={() =>
                submit({
                  kind: "confirm",
                  sample: shipBy === "2026-10-23",
                  text:
                    shipBy === "2026-10-23"
                      ? s.invoice_fixture!.text_transcript
                      : `Yes, all ${p.order_ids.length} remaining orders will ship by ${fmtDate(shipBy)}. Courier pickup booked for the full batch.`,
                })
              }
            >
              Yes, confirm
            </Button>
          </div>
        ) : (
          <div className="mt-3 space-y-2 rounded-md border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                Upload image or PDF
              </Button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              {s.invoice_fixture && (
                <Button variant="ghost" onClick={loadSample}>
                  Use sample invoice
                </Button>
              )}
              {file && <span className="text-[12px] text-ink-muted">{file.name}</span>}
            </div>
            {file?.url.startsWith("data:image") && <img src={file.url} alt="Attached invoice" className="max-h-40 rounded-sm border border-line" />}
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSample(false);
              }}
              placeholder="Or paste text, e.g. a WhatsApp message or PO details"
              className="h-20 w-full rounded-sm border border-line p-2 text-[12px] outline-none focus:border-brand"
            />
            <Button disabled={!file && !text.trim()} onClick={() => submit({ kind: file ? "invoice" : "text", text, fileDataUrl: file?.url, fileName: file?.name, sample })}>
              Submit answer
            </Button>
          </div>
        )
      ) : (
        <>
          {ps.status === "later" && <div className="mt-3 rounded-md bg-surface-alt px-3 py-2 text-[12px]">{lakh(v.waiting)} stays held until this is answered. The rest settles normally.</div>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => setComposing(true)}>{p.kind === "capacity" ? "Yes, set a ship date" : "Yes, attach proof"}</Button>
            <Button variant="secondary" onClick={() => dispatch({ type: "patternStatus", pattern: p.id, status: "not_recognised" })}>
              Don't recognise these orders
            </Button>
            {ps.status !== "later" && (
              <Button variant="ghost" onClick={() => dispatch({ type: "patternStatus", pattern: p.id, status: "later" })}>
                Answer later
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function DecidedLines({ v }: { v: PatternView }) {
  const { dispatch } = useCase();
  const d = v.decision!;
  const p = v.pattern;
  const unmatched = v.run?.unmatchedValue ?? 0;
  const showFollowUp = p.follow_up_question && unmatched > 0 && d.kind !== "override";
  return (
    <div className="mt-3 space-y-2 text-[13px]">
      <div className="rounded-md bg-positive-wash px-3 py-2">
        {d.releaseNow > 0 ? (
          <>
            Released <b>{inr(d.releaseNow)}</b> today.{" "}
          </>
        ) : null}
        {d.reserve > 0 ? (
          <>
            <b>{inr(d.reserve)}</b> held until {fmtDate(d.reserveUntil)}.
          </>
        ) : (
          <>Nothing from these orders is held.</>
        )}
      </div>
      {showFollowUp && (
        <div className="rounded-md border border-brand/30 bg-brand-wash p-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-dark">Follow-up</span>
            <AiBadge kind="scripted" />
          </div>
          <p className="mt-1 font-semibold">{p.follow_up_question!.replace("{unmatched}", inr(unmatched))}</p>
          {v.state.followUp ? (
            <div className="mt-2 text-[12px] text-ink-body">{v.state.followUp === "answered" ? "Submitted. A reviewer will confirm shortly." : "Thanks. That payment stays out of settlement while we check it."}</div>
          ) : (
            <div className="mt-2 flex gap-2">
              <Button onClick={() => dispatch({ type: "followUp", pattern: p.id, answer: "answered" })}>Yes, same order</Button>
              <Button variant="secondary" onClick={() => dispatch({ type: "followUp", pattern: p.id, answer: "not_recognised" })}>
                Don't recognise it
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

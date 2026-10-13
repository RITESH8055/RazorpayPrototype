import { useRef, useState, type ReactNode } from "react";
import { useCase } from "../state/store";
import type { PatternView } from "../state/derive";
import { AiBadge, Button, MERCHANT_PAGE as PAGE } from "../components/ui";
import { VolumeChart } from "../components/charts";
import { fmtDate, inr, lakh } from "../shared/format";
import { urlToDataUrl, type Submission } from "../lib/readReply";
import { PayoutTimeline, TrustProgress, useSettlement } from "./MerchantSidebar";

export default function SpikeScreen() {
  const { scenario: s, features: f, cs } = useCase();
  const { waiting, stopped, onTime, spikeValue, open } = useSettlement();
  const env = s.envelope;
  const declared = cs.declarationStatus === "submitted";
  const inside = f.volume_multiple >= env.volume_multiple_min && f.volume_multiple <= env.volume_multiple_max;

  return (
    <div className={PAGE}>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 xl:col-span-3">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">Your sales are {f.volume_multiple}× your usual</h1>
        <span className="text-[14px] text-ink-muted">{declared && cs.declaration ? cs.declaration.sale_name : "No sale declared"} · last 24 hours</span>
        <p className="text-[14px] text-ink-body xl:ml-auto">
          {f.spike_orders} orders, against about {f.baseline_orders_per_day} on a usual day.{" "}
          {declared && <span className={inside ? "text-positive" : "text-ink-muted"}>{inside ? "Within your plan." : "Outside your declared plan."}</span>}
        </p>
      </header>

      <div className="min-w-0 space-y-5">
        {/* The answer to "will I get paid?" */}
        <section className="rounded-2xl bg-white p-6 shadow-card">
          <div className="text-[13px] font-medium text-ink-muted">Settling on time</div>
          <div className="mt-0.5 font-display text-[40px] font-semibold leading-none text-positive">{lakh(onTime)}</div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-alt-2">
            <div className="h-1.5 rounded-full bg-positive" style={{ width: `${(onTime / spikeValue) * 100}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap justify-between gap-2 text-[15px] text-ink-body">
            <span>
              {waiting > 0 ? (
                <>
                  <b className="text-ink">{lakh(waiting)}</b> {open ? "waits for your answer" : "is held for now"}
                </>
              ) : (
                "Nothing is waiting"
              )}
            </span>
            {stopped > 0 && <span>{lakh(stopped)} stopped for cancellation</span>}
          </div>
        </section>

        {/* Questions live on their own step; here, just their status and a way in */}
        <QuestionsStatus />
      </div>

      <div className="min-w-0 space-y-5">
        <section className="rounded-2xl bg-white p-5 shadow-card">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">Orders by hour</h3>
          <div className="mt-3">
            <VolumeChart s={s} from={48} height={200} />
          </div>
          <div className="mt-2 flex gap-4 text-[13px] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-brand" /> Orders
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0 w-4 border-t-2 border-dashed border-ink" /> Your usual
            </span>
          </div>
        </section>
      </div>

      <aside className="min-w-0 space-y-5">
        <PayoutTimeline />
        <TrustProgress />
      </aside>
    </div>
  );
}

export function QuestionCard({ v }: { v: PatternView }) {
  const { scenario: s, dispatch } = useCase();
  const p = v.pattern;
  const ps = v.state;
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ url: string; name: string } | undefined>();
  const [shipBy, setShipBy] = useState("2026-10-23");
  const [sample, setSample] = useState(false);
  // The sample invoice's text travels with the image but stays out of the message box.
  const [sampleText, setSampleText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = (sub: Submission) => {
    dispatch({ type: "answer", pattern: p.id, submission: sub });
    setComposing(false);
  };
  const loadSample = async () => {
    const fx = s.invoice_fixture;
    if (!fx) return;
    setSample(true);
    setSampleText(fx.text_transcript);
    if (fx.image_path) setFile({ url: await urlToDataUrl(fx.image_path), name: fx.image_path.split("/").pop()! });
  };
  const onFile = (fl: File | undefined) => {
    if (!fl) return;
    const fr = new FileReader();
    fr.onload = () => setFile({ url: String(fr.result), name: fl.name });
    fr.readAsDataURL(fl);
    setSample(false);
    setSampleText("");
  };

  return (
    <article className="rounded-2xl bg-white p-6 shadow-card">
      <p className="font-display text-[19px] font-semibold leading-snug">{p.question_for_merchant}</p>
      {!p.question_for_merchant.includes(lakh(p.value)) && <p className="mt-1 text-[15px] text-ink-muted">{lakh(p.value)} of your sale is linked to this.</p>}

      {v.decision ? (
        <DecidedLines v={v} />
      ) : ps.status === "submitted" && !composing ? (
        <Status tone="positive" title="Sent. A reviewer will confirm shortly.">
          {ps.submission?.fileName && <>{ps.submission.fileName} · </>}
          <button className="font-semibold text-brand-dark" onClick={() => setComposing(true)}>
            Edit answer
          </button>
          {ps.edited && <div className="mt-1 text-[13px] text-ink-muted">You edited this answer; the reviewer can see both versions.</div>}
        </Status>
      ) : ps.status === "not_recognised" ? (
        <Status tone="neutral" title="Thanks. We'll stop these from settling.">
          You can cancel them before they ship.
        </Status>
      ) : composing ? (
        p.kind === "capacity" ? (
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-ink-muted">Ship all remaining orders by</span>
              <input type="date" value={shipBy} onChange={(e) => setShipBy(e.target.value)} className="rounded-xl bg-surface-alt px-3.5 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-brand/40" />
            </label>
            <Button
              size="lg"
              className="w-full"
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
              Confirm
            </Button>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <button onClick={() => fileRef.current?.click()} className="rounded-xl bg-surface-alt px-4 py-4 text-left hover:bg-surface-alt-2">
                <div className="text-[15px] font-semibold">Upload invoice</div>
                <div className="text-[13px] text-ink-muted">Photo or PDF</div>
              </button>
              {s.invoice_fixture && (
                <button onClick={loadSample} className="rounded-xl bg-surface-alt px-4 py-4 text-left hover:bg-surface-alt-2">
                  <div className="text-[15px] font-semibold">Use sample invoice</div>
                  <div className="text-[13px] text-ink-muted">For this demo</div>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
            {file && (
              <div className="flex items-center gap-3 rounded-xl bg-surface-alt p-2 pr-4">
                {file.url.startsWith("data:image") ? <img src={file.url} alt="Attached invoice" className="h-14 w-20 rounded-lg object-cover object-top" /> : <span className="grid h-14 w-20 place-items-center rounded-lg bg-white text-[12px]">PDF</span>}
                <span className="text-[14px] text-ink-body">{file.name}</span>
              </div>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={file ? "Add a note (optional)" : "Or write a short message, like you would on WhatsApp"}
              className="h-24 w-full rounded-xl bg-surface-alt p-3.5 text-[15px] outline-none placeholder:text-ink-subtle focus:bg-white focus:ring-2 focus:ring-brand/40"
            />
            <Button size="lg" className="w-full" disabled={!file && !text.trim()} onClick={() => submit({ kind: file ? "invoice" : "text", text: [sampleText, text.trim()].filter(Boolean).join("\n"), fileDataUrl: file?.url, fileName: file?.name, sample: sample && !text.trim() })}>
              Send answer
            </Button>
            <button className="w-full text-center text-[15px] text-ink-muted" onClick={() => setComposing(false)}>
              Cancel
            </button>
          </div>
        )
      ) : (
        <>
          {ps.status === "later" && (
            <Status tone="neutral" title={`${lakh(v.waiting)} stays held until you answer.`}>
              The rest of your sale settles normally.
            </Status>
          )}
          <Button size="lg" className="mt-5 w-full" onClick={() => setComposing(true)}>
            {p.kind === "capacity" ? "Yes, set a ship date" : "Yes, attach proof"}
          </Button>
          <div className="mt-3 flex justify-center gap-6 text-[15px]">
            <button className="font-medium text-ink-body hover:text-ink" onClick={() => dispatch({ type: "patternStatus", pattern: p.id, status: "not_recognised" })}>
              Don't recognise these orders
            </button>
            {ps.status !== "later" && (
              <button className="font-medium text-ink-muted hover:text-ink" onClick={() => dispatch({ type: "patternStatus", pattern: p.id, status: "later" })}>
                Answer later
              </button>
            )}
          </div>
        </>
      )}
    </article>
  );
}

function Status({ tone, title, children }: { tone: "positive" | "neutral"; title: string; children?: ReactNode }) {
  return (
    <div className={`mt-5 flex gap-3 rounded-xl px-4 py-3 ${tone === "positive" ? "bg-positive-wash" : "bg-surface-alt"}`}>
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${tone === "positive" ? "bg-positive" : "bg-ink-subtle"}`}>
        {tone === "positive" ? "✓" : "i"}
      </span>
      <div className="text-[15px]">
        <div className="font-semibold text-ink">{title}</div>
        {children && <div className="mt-0.5 text-ink-body">{children}</div>}
      </div>
    </div>
  );
}

function DecidedLines({ v }: { v: PatternView }) {
  const { dispatch } = useCase();
  const d = v.decision!;
  const p = v.pattern;
  const unmatched = v.run?.unmatchedValue ?? 0;
  const showFollowUp = p.follow_up_question && unmatched > 0 && d.kind !== "override";
  return (
    <>
      <Status tone={d.releaseNow > 0 || d.reserve === 0 ? "positive" : "neutral"} title={d.releaseNow > 0 ? `${inr(d.releaseNow)} released today` : d.reserve > 0 ? "Still under review" : "All clear"}>
        {d.reserve > 0 ? `${inr(d.reserve)} is held until ${fmtDate(d.reserveUntil)}.` : "Nothing from these orders is held."}
      </Status>
      {showFollowUp && (
        <div className="mt-3 rounded-xl border border-brand/20 bg-brand-wash/60 p-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-brand-dark">One more thing</span>
            <AiBadge kind="scripted" />
          </div>
          <p className="mt-1 text-[16px] font-semibold">{p.follow_up_question!.replace("{unmatched}", inr(unmatched))}</p>
          {v.state.followUp ? (
            <div className="mt-2 text-[14px] text-ink-body">{v.state.followUp === "answered" ? "Sent. A reviewer will confirm shortly." : "Thanks. That payment stays out of settlement while we check it."}</div>
          ) : (
            <div className="mt-3 flex gap-2">
              <Button onClick={() => dispatch({ type: "followUp", pattern: p.id, answer: "answered" })}>Yes, same order</Button>
              <Button variant="secondary" onClick={() => dispatch({ type: "followUp", pattern: p.id, answer: "not_recognised" })}>
                Don't recognise it
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function QuestionsStatus() {
  const { dispatch } = useCase();
  const { views, open } = useSettlement();
  const answered = views.filter((v) => v.state.status === "submitted" && !v.decision).length;
  const decided = views.filter((v) => v.decision).length;
  const title = open
    ? `${open === 1 ? "One question" : `${open} questions`} for you`
    : decided === views.length
      ? "All questions reviewed"
      : answered
        ? "Answer sent"
        : "Questions handled";
  const sub = open
    ? "Answer to release the amount waiting. The rest of your sale settles normally."
    : decided === views.length
      ? "A reviewer has made a decision. See the details and any follow-up."
      : "A reviewer will confirm shortly. You can still edit your answer.";
  return (
    <section className="rounded-2xl bg-white p-6 shadow-card">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-[19px] font-semibold">{title}</h2>
        {open > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-[12px] font-bold text-white">{open}</span>}
      </div>
      <p className="mt-1 text-[15px] text-ink-muted">{sub}</p>
      <Button size="lg" variant={open ? "primary" : "secondary"} className="mt-4 w-full" onClick={() => dispatch({ type: "screen", screen: "questions" })}>
        {open ? "Answer now" : "View questions"}
      </Button>
    </section>
  );
}

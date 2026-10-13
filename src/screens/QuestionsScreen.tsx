import { useCase } from "../state/store";
import { AiBadge, MERCHANT_PAGE as PAGE } from "../components/ui";
import { lakh } from "../shared/format";
import { QuestionCard } from "./SpikeScreen";
import { PayoutTimeline, useSettlement, WhyQuestions } from "./MerchantSidebar";

/** The Questions step: only what the merchant needs to answer, with the money context beside it. */
export default function QuestionsScreen() {
  const { cs } = useCase();
  const { views, waiting, open } = useSettlement();
  const declared = cs.declarationStatus === "submitted" && cs.declaration;

  return (
    <div className={PAGE}>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 xl:col-span-3">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">
          {open ? (views.length === 1 ? "One question about your orders" : `${views.length} questions about your orders`) : "Your answers"}
        </h1>
        <span className="text-[14px] text-ink-muted">{declared ? cs.declaration!.sale_name : "No sale declared"}</span>
        <AiBadge kind="scripted" />
        {waiting > 0 && (
          <p className="text-[14px] text-ink-body xl:ml-auto">
            <b>{lakh(waiting)}</b> {open ? "waits for your answer. Everything else settles on time." : "is held while we confirm."}
          </p>
        )}
      </header>

      <section id="questions" className="min-w-0 space-y-5 xl:col-span-2">
        {views.map((v) => (
          <QuestionCard key={v.pattern.id} v={v} />
        ))}
      </section>

      <aside className="min-w-0 space-y-5">
        <PayoutTimeline />
        <WhyQuestions />
      </aside>
    </div>
  );
}

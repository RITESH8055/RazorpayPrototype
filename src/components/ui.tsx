import type { ReactNode } from "react";
import type { Label } from "../lib/types";

export function Card({ title, right, children, className = "", id, highlighted }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; id?: string; highlighted?: boolean }) {
  return (
    <section id={id} className={`rounded-2xl bg-white shadow-card ${highlighted ? "card-highlight" : ""} ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-2 px-5 pt-4">
          <h3 className="font-display text-[14px] font-semibold text-ink">{title}</h3>
          {right}
        </header>
      )}
      <div className={title ? "px-5 pb-5 pt-3" : "p-5"}>{children}</div>
    </section>
  );
}

type Tone = "brand" | "positive" | "warn" | "danger" | "neutral" | "accent" | "stage";
const TONES: Record<Tone, string> = {
  brand: "bg-brand-wash text-brand-dark",
  positive: "bg-positive-wash text-positive",
  warn: "bg-warn-wash text-warn",
  danger: "bg-danger-wash text-danger",
  neutral: "bg-surface-alt-2 text-ink-body",
  accent: "bg-accent text-ink",
  stage: "bg-stage text-white",
};

export function Chip({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]} ${className}`}>{children}</span>;
}

export const LABEL_META: Record<Label, { text: string; tone: Tone }> = {
  explained: { text: "Explained", tone: "positive" },
  partly_explained: { text: "Partly explained", tone: "warn" },
  unexplained: { text: "Unexplained", tone: "danger" },
};

/** Every AI output carries one of these: a real API call, pre-written AI output, or scripted output after a failed live call. */
export function AiBadge({ kind, title, label }: { kind: "live" | "scripted" | "fallback"; title?: string; label?: string }) {
  const meta = {
    live: { text: "Live", tone: "positive" as Tone },
    scripted: { text: "Scripted", tone: "brand" as Tone },
    fallback: { text: "Fallback", tone: "warn" as Tone },
  }[kind];
  return (
    <span title={title ?? { live: "Real API call", scripted: "Pre-written AI output", fallback: "Live call failed; scripted result shown" }[kind]}>
      <Chip tone={meta.tone}>
        <span className="text-[9px]">◆</span> {label ?? meta.text}
      </Chip>
    </span>
  );
}

export const TRUST_TONE = { New: "neutral", Building: "brand", Trusted: "positive" } as const;

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  title,
  size = "md",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "plain";
  disabled?: boolean;
  className?: string;
  title?: string;
  size?: "md" | "lg";
}) {
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    secondary: "bg-surface-alt text-ink hover:bg-surface-alt-2",
    ghost: "text-brand-dark hover:bg-brand-wash",
    danger: "bg-danger-wash text-danger hover:bg-danger/15",
    plain: "text-brand-dark hover:underline !px-0",
  }[variant];
  const sizing = size === "lg" ? "rounded-xl px-5 py-3 text-[15px]" : "rounded-lg px-3.5 py-2 text-[13px]";
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sizing} ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "brand" | "danger" | "positive" }) {
  const color = tone === "brand" ? "text-brand" : tone === "danger" ? "text-danger" : tone === "positive" ? "text-positive" : "text-ink";
  return (
    <div>
      <div className="text-[11px] font-medium text-ink-muted">{label}</div>
      <div className={`font-display text-lg font-semibold leading-tight ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-ink-muted">{sub}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 className="font-display text-[17px] font-semibold">{title}</h2>
          <button className="grid h-7 w-7 place-items-center rounded-full bg-surface-alt text-[12px] text-ink-muted hover:text-ink" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="px-6 pb-6 pt-3">{children}</div>
      </div>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-brand-dark">
      <span className="h-3 w-[3px] rounded-full bg-brand" />
      {children}
    </div>
  );
}

/** iOS-style grouped list: a quiet header, rounded rows, and a footnote. */
export function Group({ title, footer, children }: { title?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section>
      {title && <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>}
      <div className="divide-y divide-line/60 overflow-hidden rounded-2xl bg-white shadow-card">{children}</div>
      {footer && <div className="mt-2 px-1 text-[13px] leading-relaxed text-ink-muted">{footer}</div>}
    </section>
  );
}

export function Row({ label, value, sub, right, onClick, muted }: { label: ReactNode; value?: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; muted?: boolean }) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className={`text-[15px] ${muted ? "text-ink-subtle" : "text-ink"}`}>{label}</div>
        {sub && <div className="mt-0.5 text-[13px] text-ink-muted">{sub}</div>}
      </div>
      {value !== undefined && <div className="max-w-[60%] text-right text-[15px] text-ink-body">{value}</div>}
      {right}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-surface-alt/60">
      {body}
    </button>
  ) : (
    <div className="flex items-center gap-4 px-5 py-3">{body}</div>
  );
}

export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-positive" : "bg-surface-alt-2"}`}
    >
      <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-[2px]"}`} />
    </button>
  );
}

/** Merchant pages: one centred column on smaller screens; three columns that fit one screen on wide ones. */
export const MERCHANT_PAGE =
  "mx-auto grid max-w-[720px] gap-5 pb-2 xl:max-w-[1440px] xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(300px,0.8fr)] xl:items-start";

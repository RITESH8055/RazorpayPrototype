import type { ReactNode } from "react";
import type { Label } from "../lib/types";

export function Card({ title, right, children, className = "", id, highlighted }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; id?: string; highlighted?: boolean }) {
  return (
    <section id={id} className={`rounded-md border border-line bg-white ${highlighted ? "card-highlight" : ""} ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-line/70 px-4 py-2.5">
          <h3 className="font-display text-[13px] font-semibold text-ink">{title}</h3>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
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

export const ACTION_TEXT: Record<string, string> = {
  partial_release: "Partial release",
  hold_and_request: "Hold and request evidence",
  hold: "Hold",
  full_release: "Full release",
};

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    secondary: "border border-line bg-white text-ink hover:border-brand hover:text-brand-dark",
    ghost: "text-brand-dark hover:bg-brand-wash",
    danger: "border border-danger/40 bg-white text-danger hover:bg-danger-wash",
  }[variant];
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-sm px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-md bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <button className="text-ink-muted hover:text-ink" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
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

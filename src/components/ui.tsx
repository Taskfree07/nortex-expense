import Link from "next/link";
import type { ReactNode } from "react";
import { cn, TONE_CLASSES, type Tone } from "@/lib/ui";
import { formatINR } from "@/lib/money";

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A policy clause, shown as the stamp it is. */
export function ClauseTag({ clause }: { clause: string }) {
  if (!clause) return null;
  return (
    <span className="ident rounded-sm border border-rule-strong px-1 py-px text-[0.6875rem] text-ink-soft">
      Policy {clause}
    </span>
  );
}

export function Money({
  value,
  className,
  muted,
  strike,
}: {
  value: number;
  className?: string;
  muted?: boolean;
  strike?: boolean;
}) {
  return (
    <span
      className={cn(
        "num",
        muted && "text-ink-faint",
        strike && "line-through decoration-rule-strong",
        className,
      )}
    >
      {formatINR(value)}
    </span>
  );
}

export function PageHeader({
  title,
  lede,
  actions,
}: {
  title: string;
  lede?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-5">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {lede ? <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{lede}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  number,
  hint,
  actions,
  children,
  className,
}: {
  title?: string;
  number?: number;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border border-rule bg-card", className)}>
      {title ? (
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">
              {number ? <span className="ident mr-2 text-ink-faint">{number}</span> : null}
              {title}
            </h2>
            {hint ? <p className="mt-0.5 text-xs text-ink-faint">{hint}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * The four numbers that decide everything, in the order the form states them.
 * One band, one rule under it - not four identical cards.
 */
export function SettlementStrip({
  items,
}: {
  items: { label: string; value: number; note?: string; emphasis?: boolean }[];
}) {
  return (
    <div className="grid grid-cols-2 divide-rule border border-rule bg-card sm:grid-cols-4 sm:divide-x">
      {items.map((item) => (
        <div key={item.label} className="px-5 py-4">
          <div className="text-xs text-ink-soft">{item.label}</div>
          <div
            className={cn(
              "num mt-1 text-lg tracking-tight",
              item.emphasis ? "font-semibold text-stamp" : "text-ink",
            )}
          >
            {formatINR(item.value)}
          </div>
          {item.note ? <div className="mt-0.5 text-xs text-ink-faint">{item.note}</div> : null}
        </div>
      ))}
    </div>
  );
}

/** Where the claim has got to, and who is holding it. */
export function Stepper({
  stages,
  currentIndex,
}: {
  stages: { key: string; label: string; hint?: string; waitingOn?: string | null }[];
  currentIndex: number;
}) {
  return (
    <ol className="flex flex-wrap gap-y-4">
      {stages.map((stage, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        return (
          <li key={stage.key} className="flex min-w-[9.5rem] flex-1 items-start gap-3">
            <div className="flex flex-col items-center pt-0.5">
              <span
                aria-hidden
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border text-[0.625rem] font-semibold",
                  done && "border-moss bg-moss text-white",
                  current && "border-stamp bg-stamp text-white",
                  !done && !current && "border-rule-strong bg-card text-ink-faint",
                )}
              >
                {done ? "✓" : index + 1}
              </span>
            </div>
            <div className="min-w-0">
              <div
                className={cn(
                  "text-xs font-medium",
                  current ? "text-stamp" : done ? "text-ink" : "text-ink-faint",
                )}
              >
                {stage.label}
              </div>
              <div className="mt-0.5 text-[0.6875rem] leading-snug text-ink-faint">
                {current && stage.waitingOn ? `Waiting on ${stage.waitingOn}` : stage.hint}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function MarginNote({
  severity,
  message,
  clause,
  resolved,
  resolutionNote,
  children,
}: {
  severity: string;
  message: string;
  clause?: string;
  resolved?: boolean;
  resolutionNote?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="margin-note py-2" data-severity={resolved ? "RESOLVED" : severity}>
      <p className={cn("text-sm leading-relaxed", resolved ? "text-ink-faint line-through" : "text-ink")}>
        {message}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {clause ? <ClauseTag clause={clause} /> : null}
        {resolved && resolutionNote ? (
          <span className="text-xs text-moss">Cleared: {resolutionNote}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-rule-strong bg-card px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const buttonStyles = {
  primary: cn(BUTTON_BASE, "bg-stamp text-white hover:bg-stamp/90"),
  secondary: cn(BUTTON_BASE, "border border-rule-strong bg-card text-ink hover:bg-paper"),
  danger: cn(BUTTON_BASE, "border border-rust/40 bg-card text-rust hover:bg-rust-wash"),
  quiet: cn(BUTTON_BASE, "text-ink-soft hover:bg-paper hover:text-ink"),
};

export function LinkButton({
  href,
  children,
  variant = "secondary",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof buttonStyles;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(buttonStyles[variant], className)}>
      {children}
    </Link>
  );
}

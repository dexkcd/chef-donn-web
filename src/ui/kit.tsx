/** Server-safe building blocks: buttons, badges, money, cards, notices. */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { formatPeso, type Cents } from "@/domain/money";
import { STATUS, type StatusTone } from "./status";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ── Buttons ─────────────────────────────────────────────────────────────────────────────
export type ButtonVariant = "primary" | "danger" | "secondary" | "ghost";
export type ButtonSize = "lg" | "md" | "sm";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-green text-cream border-green-deep hover:bg-green-deep",
  danger: "bg-red text-white border-red-deep hover:bg-red-deep",
  secondary: "bg-surface text-ink border-ink hover:bg-wash",
  ghost: "bg-transparent text-green border-transparent hover:bg-wash",
};
const SIZE: Record<ButtonSize, string> = {
  lg: "min-h-[72px] px-6 text-[18px]",
  md: "min-h-[56px] px-5 text-[18px]",
  sm: "min-h-[40px] px-3 text-[14px]",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", block = false) {
  return cx(
    "press inline-flex items-center justify-center gap-2 rounded-md border-[3px] font-[family-name:var(--font-display)] font-extrabold tracking-[-0.01em]",
    "disabled:opacity-40 disabled:cursor-not-allowed",
    VARIANT[variant],
    SIZE[size],
    block && "w-full",
  );
}

export function Button({
  variant = "primary",
  size = "md",
  block,
  className,
  ...rest
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean }) {
  return <button className={cx(buttonClass(variant, size, block), className)} {...rest} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  block,
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean }) {
  return <Link className={cx(buttonClass(variant, size, block), className)} {...rest} />;
}

// ── Status ──────────────────────────────────────────────────────────────────────────────
export function StatusBadge({ tone, label, className }: { tone: StatusTone; label?: string; className?: string }) {
  const s = STATUS[tone];
  return (
    <span
      className={cx("label inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-2.5 py-0.5 text-[13px] whitespace-nowrap", s.className, className)}
    >
      <span aria-hidden>{s.glyph}</span>
      {label ?? s.label}
    </span>
  );
}

// ── Money ───────────────────────────────────────────────────────────────────────────────
export function Money({ cents, className, signed, noCentavos }: { cents: Cents; className?: string; signed?: boolean; noCentavos?: boolean }) {
  return <span className={cx("num whitespace-nowrap", className)}>{formatPeso(cents, { signed, noCentavos })}</span>;
}

// ── Layout ──────────────────────────────────────────────────────────────────────────────
export function Card({ children, className, strong }: { children: ReactNode; className?: string; strong?: boolean }) {
  return (
    <section className={cx("rounded-lg bg-surface p-4", strong ? "border-[3px] border-ink" : "border-[1.5px] border-line", className)}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-end justify-between gap-3">
      <h2 className="label text-[15px] text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: ReactNode; back?: { href: string; label: string }; action?: ReactNode }) {
  return (
    <header className="mb-4">
      {back && (
        <Link href={back.href as never} className="label mb-2 inline-flex min-h-[40px] items-center text-green">
          ‹ {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <h1 className="display text-[28px]">{title}</h1>
        {action}
      </div>
      {subtitle && <div className="mt-1 text-muted">{subtitle}</div>}
    </header>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warning" | "danger" | "success"; title?: string; children?: ReactNode }) {
  const styles = {
    info: { cls: "border-ink bg-surface", glyph: "●" },
    warning: { cls: "border-gold-deep bg-gold-wash", glyph: "▲" },
    danger: { cls: "border-red bg-[#fbe9ec]", glyph: "✕" },
    success: { cls: "border-green bg-[#e6f3ec]", glyph: "✓" },
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-md border-[3px] p-3", styles.cls)}>
      <div className="flex gap-2">
        <span aria-hidden className="font-bold">
          {styles.glyph}
        </span>
        <div>
          {title && <div className="font-semibold">{title}</div>}
          {children && <div className="text-[15px]">{children}</div>}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border-[1.5px] border-dashed border-faint p-6 text-center">
      <div className="font-semibold">{title}</div>
      {children && <p className="mt-1 text-muted">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** A labelled figure. Numbers are always mono. */
export function Stat({ label, children, hint, tone }: { label: string; children: ReactNode; hint?: ReactNode; tone?: "default" | "danger" | "good" }) {
  return (
    <div>
      <div className="label text-[13px] text-muted">{label}</div>
      <div className={cx("num text-[22px] font-semibold leading-tight", tone === "danger" && "text-red", tone === "good" && "text-green-bright")}>{children}</div>
      {hint && <div className="text-[14px] text-muted">{hint}</div>}
    </div>
  );
}

export function KeyValue({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="divide-y-[1.5px] divide-line">
      {items.map((i) => (
        <div key={i.k} className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-muted">{i.k}</dt>
          <dd className="text-right">{i.v}</dd>
        </div>
      ))}
    </dl>
  );
}

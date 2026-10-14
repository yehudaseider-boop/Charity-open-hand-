"use client";

/** Small building blocks shared by every portal screen. */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-gz-blue text-white hover:bg-gz-blue-hover shadow-sm",
  secondary: "bg-gz-surface text-gz-blue border border-gz-hairline hover:border-gz-blue/40 hover:bg-gz-blue-soft/40",
  soft: "bg-gz-blue-soft text-gz-blue hover:bg-gz-blue-soft/70",
  ghost: "text-gz-blue hover:bg-gz-blue-soft/60",
  danger: "bg-gz-danger text-white hover:opacity-90",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3.5 text-sm gap-1.5",
  md: "min-h-11 px-5 text-[15px] gap-2",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", icon, children, className, type = "button", ...rest }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; icon?: IconName }) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "primary", size = "md", icon, children, className, ...rest }: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; icon?: IconName }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
      {children}
    </Link>
  );
}

export function IconButton({ icon, label, className, ...rest }: ComponentProps<"button"> & { icon: IconName; label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx("inline-flex size-10 items-center justify-center rounded-full text-gz-ink hover:bg-gz-blue-soft/70", className)} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

export function Card({ children, className, padded = true, ...rest }: ComponentProps<"section"> & { padded?: boolean }) {
  return (
    <section className={cx("min-w-0 rounded-[22px] border border-gz-hairline bg-gz-surface shadow-gz", padded && "p-5 sm:p-6", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg leading-tight sm:text-xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-gz-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight sm:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] text-gz-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "lilac";

const TONES: Record<Tone, string> = {
  success: "bg-gz-success-soft text-gz-success",
  warning: "bg-gz-warning-soft text-gz-warning",
  danger: "bg-gz-danger-soft text-gz-danger",
  info: "bg-gz-blue-soft text-gz-blue",
  neutral: "bg-gz-neutral-soft text-gz-muted",
  lilac: "bg-gz-lilac-soft text-gz-ink",
};

const TONE_ICON: Partial<Record<Tone, IconName>> = { success: "check", warning: "clock", danger: "alert" };

/** Status badges always pair colour with an icon or word, never colour alone. */
export function Badge({ tone = "neutral", children, icon, className }: { tone?: Tone; children: ReactNode; icon?: IconName | false; className?: string }) {
  const i = icon === false ? undefined : icon ?? TONE_ICON[tone];
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[tone], className)}>
      {i && <Icon name={i} size={13} />}
      {children}
    </span>
  );
}

export function Progress({ permille, className, tone = "sage", label }: { permille: number; className?: string; tone?: "sage" | "blue"; label?: string }) {
  const pct = Math.max(0, Math.min(100, permille / 10));
  return (
    <div className={cx("h-2.5 w-full overflow-hidden rounded-full bg-gz-neutral-soft", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx("h-full rounded-full transition-[width] duration-500", tone === "sage" ? "bg-gz-sage" : "bg-gz-blue")} style={{ width: `${pct}%` }} />
    </div>
  );
}

const AVATAR_TONES = ["bg-gz-blue-soft text-gz-blue", "bg-gz-lilac-soft text-gz-ink", "bg-gz-orange-soft text-gz-orange-text", "bg-gz-success-soft text-gz-success"];

export function Avatar({ name, size = 36, anonymous }: { name: string; size?: number; anonymous?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const tone = AVATAR_TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span aria-hidden className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", tone)} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {anonymous ? <Icon name="eyeOff" size={size * 0.45} /> : initials}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("gz-pulse rounded-xl bg-gz-neutral-soft", className)} />;
}

export function EmptyState({ icon = "search", title, body, action }: { icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 inline-flex size-12 items-center justify-center rounded-full bg-gz-lilac-soft text-gz-blue">
        <Icon name={icon} size={22} />
      </span>
      <p className="font-semibold text-gz-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-gz-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Label and value pairs, for drawers and detail panels. */
export function DetailList({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-gz-hairline">
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2.5 text-sm">
          <dt className="text-gz-muted">{k}</dt>
          <dd className="text-right font-medium text-gz-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Callout({ tone = "info", title, children, icon }: { tone?: Tone; title?: string; children: ReactNode; icon?: IconName }) {
  return (
    <div className={cx("flex gap-3 rounded-2xl p-4 text-sm", TONES[tone])}>
      <Icon name={icon ?? (tone === "warning" || tone === "danger" ? "alert" : "info")} size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cx(title && "mt-0.5", "text-gz-ink/90")}>{children}</div>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, size = "md" }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-full border border-gz-hairline bg-gz-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-full font-semibold transition-colors",
            size === "sm" ? "min-h-8 px-3 text-xs" : "min-h-9 px-3.5 text-sm",
            value === o.value ? "bg-gz-blue text-white" : "text-gz-muted hover:text-gz-blue",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

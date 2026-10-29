import Link from "next/link";
import { glow } from "@/components/card";

/**
 * The charity dashboard's building blocks (29/10/2026), so every page has the same header, buttons, tabs,
 * tables and rows as the Overview. Server-safe: no browser code here.
 */

/** A page's title, one line about it, and its buttons. `back` is the way up, for detail pages. */
export function PageHeader({ title, intro, actions, back }: { title: React.ReactNode; intro?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      {back ? <div className="text-sm">{back}</div> : null}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold text-indigo [overflow-wrap:anywhere]">{title}</h1>
          {intro ? <div className="mt-1 max-w-2xl text-sm text-muted">{intro}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

const actionBase = "inline-flex min-h-11 items-center gap-2 rounded-control px-4 text-sm font-semibold transition";
/** Classes for a secondary action (white, blue text, blue edge on hover), for a <Link>, <a> or <button>. */
export const secondaryAction = `${actionBase} border-2 border-border bg-surface text-brand hover:border-brand focus-visible:border-brand`;
/** Classes for the page's one main action: orange, ink text, a pressable edge. Use once per page at most. */
export const primaryAction = `${actionBase} pressable bg-coral px-5 font-bold text-navy`;
/** Classes for a blue action (forms' submit buttons and the like). */
export const blueAction = `${actionBase} pressable bg-brand text-brand-contrast`;

/** A button-like link. `primary` is the orange call to action; `download` is for files (a plain <a>, so the browser downloads it). */
export function ActionLink({ href, children, primary = false, download = false }: { href: string; children: React.ReactNode; primary?: boolean; download?: boolean }) {
  const cls = primary ? primaryAction : secondaryAction;
  return download ? <a href={href} className={cls}>{children}</a> : <Link href={href} className={cls}>{children}</Link>;
}

/** Pill tabs that are links (status filters, sub-pages). The current one is blue and marked for screen readers. */
export function Tabs({ label, items }: { label: string; items: { href: string; label: React.ReactNode; active: boolean; count?: number }[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-semibold transition ${t.active ? "border-brand bg-brand text-white" : "border-border bg-surface text-muted hover:border-brand hover:text-brand"}`}
        >
          {t.label}
          {t.count !== undefined ? <span className={`rounded-full px-1.5 text-xs tabular-nums ${t.active ? "bg-white/20" : "bg-honey-soft"}`}>{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** Classes for text boxes and menus, so every field looks the same. */
export const field = "min-h-11 rounded-control border-2 border-border bg-surface px-3 text-sm text-navy placeholder:text-muted focus:border-brand";

/** Classes for a table in a card: header, rows that light up, cells. Wrap the <table> in `table.wrap` so it scrolls on a phone. */
export const table = {
  wrap: "-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6",
  table: "w-full border-collapse text-sm",
  headRow: "border-b-2 border-border text-left text-xs font-bold uppercase tracking-wide text-muted",
  th: "pb-2 pr-3 font-bold",
  row: "group border-b border-border transition last:border-0 hover:bg-honey-soft focus-within:bg-honey-soft",
  td: "py-2.5 pr-3 align-middle",
  num: "py-2.5 text-right font-semibold tabular-nums",
} as const;

/** Classes for one line of a list that opens something: lights up under the pointer, the whole line is the link. */
export const rowLink = "group -mx-2 flex items-center justify-between gap-3 rounded-control px-2 py-2 transition hover:bg-honey-soft focus-visible:bg-honey-soft";

/** A small figure box. With `href` the whole box opens its detail and lights up. */
export function MiniStat({ label, value, note, href, strong = false }: { label: string; value: React.ReactNode; note?: React.ReactNode; href?: string; strong?: boolean }) {
  const cls = `block rounded-card border-2 p-4 ${strong ? "border-brand bg-brand text-white" : "border-border bg-surface"} ${href ? glow : ""}`;
  const body = (
    <>
      <p className={`text-sm font-semibold ${strong ? "text-white/85" : "text-muted"}`}>{label}</p>
      <p className="mt-1 whitespace-nowrap font-display text-2xl font-extrabold leading-tight tabular-nums">{value}</p>
      {note ? <p className={`mt-0.5 text-sm ${strong ? "text-white/85" : "text-muted"}`}>{note}</p> : null}
    </>
  );
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** What an empty list says: what will appear here, and the one thing to do about it. */
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-card border-2 border-dashed border-honey bg-honey-soft/60 p-6 text-center">
      <p className="font-display text-lg font-bold text-indigo">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

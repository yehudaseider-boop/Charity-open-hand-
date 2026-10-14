"use client";

/**
 * Sortable, paginated table. On a phone each row becomes a card (`mobile`), so nobody
 * scrolls sideways through columns.
 */
import { useMemo, useState, type ReactNode } from "react";
import { count } from "./format";
import { Icon } from "./icons";
import { cx } from "./primitives";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Sortable when given. */
  sort?: (row: T) => string | number;
  align?: "left" | "right";
  /** Hide on medium screens to keep the table readable. */
  wide?: boolean;
  /** Let the cell wrap (names, campaigns). Numbers and dates never wrap. */
  wrap?: boolean;
};

type SortState = { key: string; dir: "asc" | "desc" } | null;

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  rowLabel,
  mobile,
  pageSize = 12,
  initialSort = null,
  empty,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** What a screen reader hears for the row's open button. */
  rowLabel?: (row: T) => string;
  mobile: (row: T) => ReactNode;
  pageSize?: number;
  initialSort?: SortState;
  empty?: ReactNode;
  caption: string;
}) {
  const [sort, setSort] = useState<SortState>(initialSort);
  const [pageState, setPage] = useState({ page: 1, rows });
  // Back to page 1 whenever the rows change (a new search or filter).
  const page = pageState.rows === rows ? pageState.page : 1;

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const r = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages);
  const slice = sorted.slice((current - 1) * pageSize, current * pageSize);
  const go = (p: number) => setPage({ page: Math.max(1, Math.min(pages, p)), rows });

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === "desc" ? { key, dir: "asc" } : null) : { key, dir: "desc" }));

  if (!rows.length) return <>{empty}</>;

  return (
    <div>
      <div className="hidden md:block">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cx("whitespace-nowrap border-b border-gz-hairline px-3 pb-2.5 pt-1 text-xs font-semibold text-gz-muted first:pl-0 last:pr-0", c.align === "right" ? "text-right" : "text-left", c.wide && "hidden xl:table-cell")}
                  >
                    {c.sort ? (
                      <button type="button" onClick={() => toggleSort(c.key)} className={cx("inline-flex items-center gap-1 rounded-md py-1 hover:text-gz-blue", active && "text-gz-blue", c.align === "right" && "flex-row-reverse")}>
                        {c.header}
                        <Icon name={active ? (sort!.dir === "asc" ? "chevronUp" : "chevronDown") : "sort"} size={13} className={active ? "" : "opacity-40"} />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => (
              <tr key={rowKey(row)} className={cx("group", onRowClick && "cursor-pointer")} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {columns.map((c, i) => (
                  <td key={c.key} className={cx("border-b border-gz-hairline/70 px-3 py-3 align-middle first:pl-0 last:pr-0 group-hover:bg-gz-blue-soft/30", c.align === "right" && "text-right", !c.wrap && i > 0 && "whitespace-nowrap", c.wide && "hidden xl:table-cell")}>
                    {i === 0 && onRowClick ? (
                      <button type="button" className="text-left focus-visible:underline" aria-label={rowLabel?.(row)} onClick={(e) => { e.stopPropagation(); onRowClick(row); }}>
                        {c.cell(row)}
                      </button>
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-gz-hairline md:hidden">
        {slice.map((row) => (
          <li key={rowKey(row)}>
            {onRowClick ? (
              <button type="button" onClick={() => onRowClick(row)} aria-label={rowLabel?.(row)} className="block w-full py-3 text-left">
                {mobile(row)}
              </button>
            ) : (
              <div className="py-3">{mobile(row)}</div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gz-muted">
        <p>
          Showing {count((current - 1) * pageSize + 1)} to {count(Math.min(current * pageSize, sorted.length))} of {count(sorted.length)}
        </p>
        {pages > 1 && (
          <nav aria-label="Pages" className="flex items-center gap-1">
            <PageButton label="Previous page" disabled={current === 1} onClick={() => go(current - 1)} icon="chevronLeft" />
            <span className="px-2 font-medium text-gz-ink">
              Page {current} of {count(pages)}
            </span>
            <PageButton label="Next page" disabled={current === pages} onClick={() => go(current + 1)} icon="chevronRight" />
          </nav>
        )}
      </div>
    </div>
  );
}

function PageButton({ label, disabled, onClick, icon }: { label: string; disabled: boolean; onClick: () => void; icon: "chevronLeft" | "chevronRight" }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="inline-flex size-10 items-center justify-center rounded-full border border-gz-hairline bg-gz-surface text-gz-blue hover:bg-gz-blue-soft disabled:opacity-40">
      <Icon name={icon} size={18} />
    </button>
  );
}

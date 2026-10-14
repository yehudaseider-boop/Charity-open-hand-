"use client";

/** Modal dialogs, side drawers and toast messages. Escape closes; focus moves in and back out. */
import { useEffect, useRef, type ReactNode } from "react";
import { usePortal } from "../store";
import { Icon } from "./icons";
import { cx, IconButton } from "./primitives";

function useOverlay(open: boolean, onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab" && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => panel.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open]);
  return panel;
}

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  const panel = useOverlay(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-gz-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "gz-fade-in relative flex max-h-[92vh] w-full flex-col rounded-t-[28px] bg-gz-surface shadow-gz-lg outline-none sm:rounded-[28px]",
          size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gz-hairline px-6 pb-4 pt-5">
          <div>
            <h2 className="text-xl">{title}</h2>
            {description && <p className="mt-1 text-sm text-gz-muted">{description}</p>}
          </div>
          <IconButton icon="x" label="Close" onClick={onClose} className="-mr-2 -mt-1" />
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-gz-hairline px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/** A panel from the right on wide screens, full screen on a phone. */
export function Drawer({ open, onClose, title, subtitle, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const panel = useOverlay(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-gz-ink/30" onClick={onClose} aria-hidden />
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"} className="gz-slide-in relative flex h-full w-full flex-col bg-gz-cream shadow-gz-lg outline-none sm:max-w-lg">
        <div className="flex items-start justify-between gap-3 border-b border-gz-hairline bg-gz-surface px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            <div className="text-xl font-semibold text-gz-blue" style={{ fontFamily: "var(--font-fredoka)" }}>
              {title}
            </div>
            {subtitle && <div className="mt-1 text-sm text-gz-muted">{subtitle}</div>}
          </div>
          <IconButton icon="x" label="Close" onClick={onClose} className="-mr-2 -mt-1" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap gap-2 border-t border-gz-hairline bg-gz-surface px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel, danger }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: ReactNode; confirmLabel: string; danger?: boolean }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className="min-h-11 rounded-full px-5 text-[15px] font-semibold text-gz-blue hover:bg-gz-blue-soft/60">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={cx("min-h-11 rounded-full px-5 text-[15px] font-semibold text-white", danger ? "bg-gz-danger" : "bg-gz-blue hover:bg-gz-blue-hover")}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[15px] text-gz-ink">{body}</div>
    </Modal>
  );
}

const TOAST_STYLE = {
  success: { icon: "check" as const, ring: "bg-gz-success-soft text-gz-success" },
  error: { icon: "alert" as const, ring: "bg-gz-danger-soft text-gz-danger" },
  info: { icon: "info" as const, ring: "bg-gz-blue-soft text-gz-blue" },
};

export function Toasts() {
  const { toasts, dismissToast } = usePortal();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:items-end">
      {toasts.map((t) => (
        <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="gz-fade-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-gz-hairline bg-gz-surface p-3.5 shadow-gz-lg">
          <span className={cx("inline-flex size-8 shrink-0 items-center justify-center rounded-full", TOAST_STYLE[t.tone].ring)}>
            <Icon name={TOAST_STYLE[t.tone].icon} size={16} />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm font-semibold text-gz-ink">{t.title}</p>
            {t.body && <p className="mt-0.5 text-sm text-gz-muted">{t.body}</p>}
          </div>
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="-mr-1 inline-flex size-8 items-center justify-center rounded-full text-gz-muted hover:bg-gz-neutral-soft">
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

"use client";

/** The portal frame: demo banner, sidebar (a slide-out menu on phones), top bar and the charity switcher. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PortalProvider, usePortal } from "../store";
import { Icon, type IconName } from "./icons";
import { ConfirmDialog, Toasts } from "./overlay";
import { Avatar, cx, IconButton } from "./primitives";

export const BASE = "/portal-demo";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: BASE, label: "Overview", icon: "home" },
  { href: `${BASE}/donations`, label: "Donations", icon: "donations" },
  { href: `${BASE}/donors`, label: "Donors", icon: "users" },
  { href: `${BASE}/campaigns`, label: "Campaigns", icon: "flag" },
  { href: `${BASE}/recurring`, label: "Monthly giving", icon: "repeat" },
  { href: `${BASE}/receipts`, label: "s18A receipts", icon: "receipt" },
  { href: `${BASE}/analytics`, label: "Analytics", icon: "chart" },
  { href: `${BASE}/finances`, label: "Finances and payouts", icon: "wallet" },
  { href: `${BASE}/settings`, label: "Settings and team", icon: "settings" },
];

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <PortalProvider>
      <Frame>{children}</Frame>
    </PortalProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  // Close the phone menu after navigating.
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  return (
    <div className="gz-portal min-h-screen">
      <DemoBanner />
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 border-r border-gz-hairline bg-gz-surface lg:block">
          <Sidebar />
        </aside>
        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-gz-ink/40" onClick={() => setMenuOpen(false)} aria-hidden />
            <aside className="gz-fade-in absolute inset-y-0 left-0 w-[86vw] max-w-[300px] bg-gz-surface shadow-gz-lg" aria-label="Menu">
              <div className="absolute right-2 top-3">
                <IconButton icon="x" label="Close menu" onClick={() => setMenuOpen(false)} />
              </div>
              <Sidebar />
            </aside>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <TopBar onMenu={() => setMenuOpen(true)} />
          <div id="gz-content" className="mx-auto w-full max-w-[1320px] px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-8">{children}</div>
        </div>
      </div>
      <Toasts />
    </div>
  );
}

function DemoBanner() {
  const { resetDemo, toast } = usePortal();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="relative z-30 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-gz-ink px-4 py-2 text-center text-xs text-white">
      <span className="rounded-full bg-gz-orange px-2 py-0.5 font-bold tracking-wide text-gz-ink">DEMO MODE</span>
      <span className="text-white/85">Fictional charities and donors. Nothing here sends email, moves money or changes real records.</span>
      <button type="button" onClick={() => setConfirm(true)} className="-my-2 inline-flex min-h-10 items-center px-1 font-semibold text-white underline underline-offset-2 hover:text-gz-lilac">
        Reset demo
      </button>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          resetDemo();
          toast({ tone: "success", title: "Demo reset", body: "Campaigns, team and settings are back to the starting data." });
        }}
        title="Reset the demo?"
        body="This clears the campaigns, team changes and settings you made in this browser and goes back to the starting demo data."
        confirmLabel="Reset demo"
      />
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-3 pt-5">
        <Link href={BASE} className="inline-flex items-end gap-2" aria-label="Givezy charity portal home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/givezy/logo.png" alt="Givezy" width={108} height={36} className="h-9 w-auto" />
          <span className="mb-0.5 rounded-full bg-gz-lilac-soft px-2 py-0.5 text-[11px] font-semibold text-gz-ink">for charities</span>
        </Link>
      </div>
      <div className="px-3">
        <CharitySwitcher />
      </div>
      <nav aria-label="Portal" className="mt-4 flex-1 overflow-y-auto px-3">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = item.href === BASE ? pathname === BASE : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium transition-colors",
                    active ? "bg-gz-blue text-white shadow-sm" : "text-gz-ink hover:bg-gz-blue-soft/70 hover:text-gz-blue",
                  )}
                >
                  <Icon name={item.icon} size={19} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="m-3 rounded-2xl bg-gz-lilac-soft p-4 text-xs text-gz-ink">
        <p className="font-semibold">Design prototype</p>
        <p className="mt-1 text-gz-ink/80">Every figure comes from fictional demo data. Changes you make stay in this browser.</p>
      </div>
    </div>
  );
}

export function CharityLogo({ size = 36 }: { size?: number }) {
  const { data, overrides, charities, charityId } = usePortal();
  const charity = data?.charity ?? charities.find((c) => c.id === charityId)!;
  const logo = overrides.branding?.logoDataUrl;
  if (logo)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" width={size} height={size} className="shrink-0 rounded-xl object-cover" style={{ width: size, height: size }} />;
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-xl bg-gz-blue font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {charity.initials}
    </span>
  );
}

const SIZE_LABEL = { small: "Small community charity", medium: "Medium education charity", large: "Larger medical charity" };

function CharitySwitcher() {
  const { charities, charityId, switchCharity, toast } = usePortal();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = charities.find((c) => c.id === charityId)!;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={box}>
      <button type="button" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 rounded-2xl border border-gz-hairline bg-gz-cream p-2.5 text-left hover:border-gz-blue/40">
        <CharityLogo />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-gz-ink">{current.shortName}</span>
          <span className="block truncate text-xs text-gz-muted">Demo charity · switch</span>
        </span>
        <Icon name="switch" size={16} className="text-gz-muted" />
      </button>
      {open && (
        <ul role="listbox" aria-label="Demo charities" className="gz-fade-in absolute inset-x-0 z-40 mt-2 rounded-2xl border border-gz-hairline bg-gz-surface p-1.5 shadow-gz-lg">
          {charities.map((c) => (
            <li key={c.id} role="option" aria-selected={c.id === charityId}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (c.id !== charityId) {
                    switchCharity(c.id);
                    toast({ tone: "info", title: `Switched to ${c.shortName}`, body: "Every screen now shows this demo charity's data." });
                  }
                }}
                className={cx("flex w-full items-start gap-3 rounded-xl p-2.5 text-left", c.id === charityId ? "bg-gz-blue-soft" : "hover:bg-gz-neutral-soft")}
              >
                <span aria-hidden className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-gz-blue text-xs font-semibold text-white">
                  {c.initials}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gz-ink">{c.shortName}</span>
                  <span className="block text-xs text-gz-muted">{SIZE_LABEL[c.size]}</span>
                </span>
                {c.id === charityId && <Icon name="check" size={16} className="ml-auto mt-1 text-gz-blue" />}
              </button>
            </li>
          ))}
          <li className="px-2.5 pb-1 pt-2 text-[11px] text-gz-muted">A visual demo of one person running several charities. Real tenant separation is done by the database, not this switch.</li>
        </ul>
      )}
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { data, charities, charityId, toast } = usePortal();
  const charity = data?.charity ?? charities.find((c) => c.id === charityId)!;
  const owner = data?.team.find((m) => m.role === "owner");
  const [menu, setMenu] = useState(false);
  return (
    <header className="sticky top-0 z-20 border-b border-gz-hairline bg-gz-cream/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-3 px-4 sm:px-6 lg:px-10">
        <IconButton icon="menu" label="Open menu" onClick={onMenu} className="-ml-2 lg:hidden" />
        <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
          <CharityLogo size={30} />
          <span className="truncate text-sm font-semibold">{charity.shortName}</span>
        </div>
        <div className="hidden min-w-0 items-center gap-2 lg:flex">
          <span className="truncate text-sm font-semibold text-gz-ink">{charity.name}</span>
          {charity.s18a && <span className="rounded-full border border-gz-sage px-2 py-0.5 text-[11px] font-semibold text-gz-success">s18A</span>}
        </div>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => toast({ tone: "info", title: "Public page (demo)", body: `In the live portal this opens ${charity.shortName}'s Givezy page. Not linked in the demo.` })}
            className="hidden min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-gz-blue hover:bg-gz-blue-soft/60 sm:inline-flex"
          >
            <Icon name="external" size={16} />
            Public page
          </button>
          <IconButton icon="bell" label="Notifications (demo)" onClick={() => toast({ tone: "info", title: "No new notifications", body: "Notification settings are under Settings and team." })} />
          <div className="relative">
            <button type="button" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="inline-flex items-center gap-2 rounded-full p-1 hover:bg-gz-blue-soft/60" aria-label="Account menu">
              <Avatar name={owner?.name ?? "Demo user"} size={34} />
            </button>
            {menu && (
              <div className="gz-fade-in absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-gz-hairline bg-gz-surface p-2 shadow-gz-lg" onMouseLeave={() => setMenu(false)}>
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold">{owner?.name ?? "Demo user"}</p>
                  <p className="text-xs text-gz-muted">Owner · demo account</p>
                </div>
                <Link href={`${BASE}/settings`} onClick={() => setMenu(false)} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm hover:bg-gz-neutral-soft">
                  <Icon name="settings" size={16} /> Settings and team
                </Link>
                <button type="button" onClick={() => { setMenu(false); toast({ tone: "info", title: "Sign out is not part of the demo" }); }} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm hover:bg-gz-neutral-soft">
                  <Icon name="logout" size={16} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

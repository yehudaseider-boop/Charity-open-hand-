import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard-shell";
import { getViewer, requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CharityLayout({ children, params }: LayoutProps<"/charity-admin/[id]">) {
  const { id } = await params;
  // Signed out: the sign-in page, never "not found" (the layout and the page render side by side).
  await requireViewer(`/charity-admin/${id}`);
  const { charity } = await loadCharityForManager(id);
  // Givezy looking at a charity it isn't part of: say so on every page, since what it saves is real.
  const viewer = await getViewer();
  const asGivezy = Boolean(viewer?.isPlatformAdmin && !viewer.managedCharityIds.includes(id));
  return (
    <DashboardShell id={id} charity={charity} asGivezy={asGivezy}>
      {children}
    </DashboardShell>
  );
}

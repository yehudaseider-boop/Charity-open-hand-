import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isStopToken } from "@/lib/launch-list";
import { StopForm } from "./stop-form";

export const metadata: Metadata = { title: "Leave the launch list", robots: { index: false } };

/**
 * The one-tap unsubscribe for the launch email (10/11/2026). The link opens this page and a press confirms, so a
 * mail scanner that opens links can't take anyone off the list by itself. Nothing on the page says whether the
 * address is on the list.
 */
export default async function StopPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isStopToken(token)) notFound();
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 py-10">
      <h1 className="font-display text-[2rem] font-extrabold leading-tight">Leave the launch list</h1>
      <p className="text-muted">You asked us to email you once, when Givezy launches. Press below and we won&apos;t.</p>
      <StopForm token={token} />
      <Link href="/" className="text-brand underline underline-offset-4">Back to Givezy</Link>
    </div>
  );
}

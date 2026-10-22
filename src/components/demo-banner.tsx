import Link from "next/link";

/** On every page of the demo site (demo mode only). */
export function DemoBanner() {
  return (
    <div role="note" className="bg-coral px-4 py-2 text-center text-sm text-navy print:hidden">
      <strong className="font-semibold">This is a demo.</strong> Everything here is made up. Nothing is charged, no real emails are
      sent, and it all resets every night. <Link href="/demo" className="font-medium underline">Switch person</Link>
    </div>
  );
}

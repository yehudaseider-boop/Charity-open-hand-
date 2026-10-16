import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/card";
import { requireViewer } from "@/lib/auth";
import { canIssue18a } from "@/lib/charities";
import { loadCharityForManager } from "@/lib/charity/queries";
import { charityPageUrl, qrSvg } from "@/lib/charity/qr";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "QR poster" };

/**
 * A printable A4 poster: the charity's name, a large QR code to its Givezy page, and one line on how
 * to use it. For a notice board, a front desk or an event table.
 */
export default async function PosterPage({ params }: PageProps<"/charity-admin/[id]/poster">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/poster`);
  const { charity } = await loadCharityForManager(id);
  if (charity.status !== "approved") {
    return <Notice tone="warning">Your QR poster is ready once your charity is approved and listed.</Notice>;
  }
  const url = charityPageUrl(charity.slug);
  const svg = await qrSvg(url);
  const shortUrl = url.replace(/^https?:\/\//, "");
  const download = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return (
    <div className="space-y-4">
      <div className="space-y-2 print:hidden">
        <h1 className="font-display text-2xl text-indigo">QR poster</h1>
        <p className="text-sm text-muted">
          Put this up where your community sees it: a notice board, your front desk, a table at an event. People point
          their phone camera at the code and land on your Givezy page, ready to give.
        </p>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <a href={download} download={`givezy-qr-${charity.slug}.svg`} className="rounded-control border border-border px-4 py-2.5">
            Download the QR code only
          </a>
        </div>
        <p className="text-xs text-muted">Tip: in the print window, choose &quot;Save as PDF&quot; to email it or send it to a print shop.</p>
      </div>

      {/* The poster itself: what prints. */}
      <section className="mx-auto max-w-md space-y-5 rounded-card border border-border bg-surface p-8 text-center print:max-w-none print:border-0 print:p-0">
        <p className="text-base font-semibold text-muted print:text-xl">Give to</p>
        <h2 className="text-3xl font-semibold leading-tight text-indigo print:text-5xl">{charity.name_en}</h2>
        <div
          className="mx-auto w-64 print:w-[11cm]"
          role="img"
          aria-label={`QR code that opens ${shortUrl}`}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="text-lg font-semibold print:text-2xl">Point your phone camera here to give</p>
        <p className="text-sm text-muted print:text-base">or go to {shortUrl}</p>
        {canIssue18a(charity) ? <p className="text-sm print:text-base">Donations get an s18A tax receipt.</p> : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Givezy" width={97} height={32} className="mx-auto h-8 w-auto print:h-10" />
      </section>

      <p className="text-sm print:hidden">
        <Link href={`/charity-admin/${id}`} className="text-brand underline">Back to your dashboard</Link>
      </p>
    </div>
  );
}

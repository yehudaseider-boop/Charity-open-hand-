import type { Metadata } from "next";
import Link from "next/link";
import { Key } from "@/components/marketing";
import { charityRequestsOpen } from "@/config/app-links";
import { getViewer } from "@/lib/auth";
import { CHARITY_REQUEST_LIMITS } from "@/lib/charity-requests";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "Ask us to add a charity" };

const next = [
  { title: "We contact them", body: "We tell the charity donors are asking for them, and how to join." },
  { title: "We check them", body: "Every charity is checked before it can take a gift: registration and bank account." },
  { title: "You hear once", body: "If you ticked the box, we email you once when they join. Nothing else." },
];

/**
 * "Request a charity" (Yehuda, 15/11/2026): reached from an empty search and from the foot of the charities list.
 * A search that found nothing arrives with what was typed as the name (?name=). Off until the switch is on.
 */
export default async function RequestCharityPage({ searchParams }: PageProps<"/charities/request">) {
  const sp = await searchParams;
  const typed = typeof sp.name === "string" ? sp.name.replace(/\s+/g, " ").trim().slice(0, CHARITY_REQUEST_LIMITS.name) : "";
  const open = charityRequestsOpen();
  const viewer = open ? await getViewer().catch(() => null) : null;

  return (
    <div className="full-bleed overflow-x-clip">
      <section className="relative isolate">
        <span aria-hidden className="pointer-events-none absolute -left-40 -top-28 -z-10 h-[24rem] w-[24rem] rounded-full bg-honey-soft" />
        <span aria-hidden className="pointer-events-none absolute -right-24 top-16 -z-10 h-64 w-64 rounded-full bg-peach max-md:hidden" />
        <div className="mx-auto grid max-w-[75rem] gap-10 px-4 pb-14 pt-8 sm:px-6 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <Link href="/charities" className="inline-flex min-h-11 w-fit items-center font-bold text-brand underline underline-offset-4">
              Back to charities
            </Link>
            <h1 className="font-display text-[clamp(2.25rem,6vw,3.75rem)] leading-[1] tracking-[-0.03em] text-balance">
              Can&apos;t find your <Key>charity</Key>?
            </h1>
            <p className="max-w-[36rem] text-[clamp(1.0625rem,1.8vw,1.1875rem)] leading-relaxed text-muted">
              Tell us who they are and we&apos;ll ask them to join. Only the name is needed.
            </p>
            {open ? (
              <div className="max-w-[36rem]">
                <RequestForm defaultName={typed} defaultEmail={viewer?.email ?? ""} />
              </div>
            ) : (
              <p role="status" className="max-w-[36rem] rounded-[1.25rem] bg-honey-soft p-5 text-[16px] font-semibold">
                Requests aren&apos;t open yet. Please come back soon.
              </p>
            )}
          </div>
          <aside aria-labelledby="what-next" className="h-fit space-y-4 rounded-[1.5rem] bg-brand-soft p-6">
            <h2 id="what-next" className="font-display text-[1.375rem] leading-tight">What happens next</h2>
            <ol className="space-y-4">
              {next.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white">{i + 1}</span>
                  <div className="min-w-0">
                    <h3 className="font-bold">{s.title}</h3>
                    <p className="text-[15px] leading-relaxed text-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-[14px] text-muted">
              Run the charity yourself? <Link href="/apply" className="font-bold text-brand underline underline-offset-4">List it here</Link>
            </p>
          </aside>
        </div>
      </section>
    </div>
  );
}

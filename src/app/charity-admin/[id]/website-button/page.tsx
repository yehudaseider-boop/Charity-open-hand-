import type { Metadata } from "next";
import Link from "next/link";
import { Card, Notice } from "@/components/card";
import { SupportContact } from "@/components/legal";
import { requireViewer } from "@/lib/auth";
import { loadOpenCampaigns } from "@/lib/charity/campaign-queries";
import { loadCharityForManager } from "@/lib/charity/queries";
import { siteOrigin } from "@/lib/request-origin";
import { ButtonBuilder } from "./button-builder";

export const metadata: Metadata = { title: "Website button" };

/** Website builders charities use most, and where the code goes in each. */
const STEPS: { name: string; steps: string[] }[] = [
  {
    name: "WordPress",
    steps: [
      "Open the page where you want the button and click Edit.",
      "Click the + where the button should go and choose Custom HTML.",
      "Paste the code into the box.",
      "Click Preview to check it, then Update.",
    ],
  },
  {
    name: "Wix",
    steps: [
      "Open your site in the Wix editor and go to the page.",
      "Click Add Elements (+), then Embed Code, then Embed HTML.",
      "Choose Code, paste the code and click Update.",
      "Drag the box to where you want it and make it big enough to show the whole button, then Publish.",
    ],
  },
  {
    name: "Squarespace",
    steps: [
      "Open the page and click Edit.",
      "Click Add Block (+) where the button should go and choose Code.",
      "Paste the code, make sure the type is HTML, and click outside the box.",
      "Click Save, then check the page.",
    ],
  },
  {
    name: "Anything else, or your web designer",
    steps: [
      "Send your web designer the code with this note: \"Please put this Givezy donate button on our website.\"",
      "Already have a Donate button? Copy just the link instead and set it as that button's link.",
    ],
  },
];

/**
 * The "Give with Givezy" button for the charity's own website: pick a look, see it, copy the code,
 * and step-by-step help for the website builders charities use. Donors who press it see only this
 * charity on Givezy, and the gifts show as "Website button" on the Donations page.
 */
export default async function WebsiteButtonPage({ params }: PageProps<"/charity-admin/[id]/website-button">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/website-button`);
  const { charity } = await loadCharityForManager(id);
  const back = <Link href={`/charity-admin/${id}`} className="inline-block text-sm text-brand underline">Back to your overview</Link>;
  if (charity.status !== "approved") {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl text-indigo">Website button</h1>
        <Notice tone="warning">Your website button is ready once your charity is approved and listed.</Notice>
        {back}
      </div>
    );
  }
  const campaigns = (await loadOpenCampaigns(charity.id)).map((c) => ({ id: c.id, title: c.title }));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-2xl text-indigo">Website button</h1>
        <p className="max-w-2xl text-[15px] text-muted">
          Put a &quot;Give with Givezy&quot; button on your own website. Donors who press it land on your Givezy page and see only
          your charity, with no other charities to wander off to. Gifts made this way show as &quot;Website button&quot; on your Donations page.
        </p>
      </div>

      <Card title="Make your button">
        <ButtonBuilder site={siteOrigin("http://localhost:3000")} slug={charity.slug} charityName={charity.name_en} campaigns={campaigns} />
      </Card>

      <Card title="2. Add it to your website">
        <p className="mb-4 text-sm text-muted">Find the one your website is built with. It takes about five minutes, and you can take the button off again the same way.</p>
        <div className="space-y-2">
          {STEPS.map((s) => (
            <details key={s.name} className="group rounded-control border-2 border-border bg-surface">
              <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 font-semibold text-navy">
                {s.name}
                <span aria-hidden className="text-muted transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <ol className="list-decimal space-y-1.5 px-4 pb-4 pl-9 text-[15px]">
                {s.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </details>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">Stuck? Send us your website address and we&apos;ll help you put it up: <SupportContact />.</p>
      </Card>

      {back}
    </div>
  );
}

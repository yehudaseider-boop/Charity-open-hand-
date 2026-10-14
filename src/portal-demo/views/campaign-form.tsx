"use client";

/** Create and edit a campaign. Used as a page (new) and inside a dialog (edit). Saved in this browser only. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatRand, parseRandToCents } from "@/lib/money";
import { DEMO_TODAY } from "../data/demo-config";
import type { Campaign, DemoDataset } from "../data/types";
import { usePortal } from "../store";
import { TextArea, TextInput, Toggle } from "../ui/form";
import { Button, ButtonLink, Callout, Card, PageHeader } from "../ui/primitives";
import { BASE } from "../ui/shell";
import { Loaded } from "./common";

export const campaignLink = (charitySlug: string, slug: string) => `https://givezy.example/c/${charitySlug}/${slug}`;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

type Errors = Partial<Record<"name" | "summary" | "goal" | "startDate" | "endDate" | "slug", string>>;

export function CampaignForm({ data, campaign, onDone, onCancel }: { data: DemoDataset; campaign?: Campaign; onDone: (c: Campaign) => void; onCancel: () => void }) {
  const { saveCampaign, toast } = usePortal();
  const editing = !!campaign;
  const [name, setName] = useState(campaign?.name ?? "");
  const [summary, setSummary] = useState(campaign?.summary ?? "");
  const [goal, setGoal] = useState(campaign ? formatRand(campaign.goalCents).replace(/^R/, "") : "");
  const [startDate, setStartDate] = useState(campaign?.startDate ?? DEMO_TODAY);
  const [hasEnd, setHasEnd] = useState(campaign ? !!campaign.endDate : true);
  const [endDate, setEndDate] = useState(campaign?.endDate ?? "");
  const [slug, setSlug] = useState(campaign?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(editing);
  const [errors, setErrors] = useState<Errors>({});

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const validate = (): { ok: true; goalCents: number } | { ok: false } => {
    const e: Errors = {};
    if (name.trim().length < 3) e.name = "Give the campaign a name of at least 3 characters.";
    else if (name.trim().length > 80) e.name = "Keep the name under 80 characters.";
    if (summary.trim().length < 10) e.summary = "Add a sentence about what the money is for.";
    const goalCents = parseRandToCents(goal);
    if (goalCents === null || goalCents <= 0) e.goal = "Enter the goal in Rand, for example 25 000.";
    if (!startDate) e.startDate = "Choose a start date.";
    if (hasEnd && !endDate) e.endDate = "Choose an end date, or switch off the end date.";
    if (hasEnd && endDate && startDate && endDate < startDate) e.endDate = "The end date must be after the start date.";
    if (!/^[a-z0-9-]{3,60}$/.test(effectiveSlug)) e.slug = "Use 3 to 60 lowercase letters, numbers and dashes.";
    else if (data.campaigns.some((c) => c.slug === effectiveSlug && c.id !== campaign?.id)) e.slug = "Another campaign already uses this link.";
    setErrors(e);
    if (Object.keys(e).length) return { ok: false };
    return { ok: true, goalCents: goalCents! };
  };

  const submit = (publish: boolean) => {
    const v = validate();
    if (!v.ok) {
      toast({ tone: "error", title: "Check the form", body: "Some fields need attention before saving." });
      return;
    }
    const saved: Campaign = {
      id: campaign?.id ?? `demo-${Date.now()}`,
      charityId: data.charity.id,
      name: name.trim(),
      slug: effectiveSlug,
      summary: summary.trim(),
      goalCents: v.goalCents,
      startDate,
      endDate: hasEnd ? endDate : null,
      status: campaign ? campaign.status : publish ? "active" : "draft",
      createdAt: campaign?.createdAt ?? new Date().toISOString(),
    };
    saveCampaign(saved);
    toast({ tone: "success", title: editing ? "Campaign saved" : publish ? "Campaign published (demo)" : "Draft saved", body: editing ? "Your changes show everywhere in the portal." : "Saved in this browser only. Nothing was published." });
    onDone(saved);
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(true);
      }}
      className="space-y-5"
    >
      <TextInput label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="For example: Winter blankets 2027" maxLength={90} />
      <TextArea label="What is it for?" value={summary} onChange={(e) => setSummary(e.target.value)} error={errors.summary} hint="One or two sentences. Donors see this on the campaign page." maxLength={280} />
      <TextInput label="Fundraising goal" prefix="R" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} error={errors.goal} hint={editing ? "Changing the goal updates progress everywhere." : "In Rand. You can change it later."} placeholder="25 000" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Starts" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} error={errors.startDate} />
        {hasEnd ? <TextInput label="Ends" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} error={errors.endDate} /> : <div className="hidden sm:block" />}
      </div>
      <Toggle label="Has an end date" description="Switch off for a campaign that runs until you end it." checked={hasEnd} onChange={setHasEnd} />
      <TextInput
        label="Campaign link"
        value={effectiveSlug}
        onChange={(e) => {
          setSlugTouched(true);
          setSlug(e.target.value.toLowerCase());
        }}
        error={errors.slug}
        hint={<span className="break-all">{campaignLink(data.charity.publicSlug, effectiveSlug || "your-campaign")} (demo address)</span>}
      />
      <div className="flex flex-wrap justify-end gap-2 border-t border-gz-hairline pt-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {editing ? (
          <Button type="submit" icon="check">
            Save changes
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => submit(false)}>
              Save as draft
            </Button>
            <Button type="submit" icon="check">
              Publish campaign
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

export function NewCampaignView() {
  const router = useRouter();
  return (
    <Loaded>
      {(data) => (
        <div className="gz-fade-in mx-auto max-w-2xl">
          <ButtonLink href={`${BASE}/campaigns`} variant="ghost" size="sm" icon="chevronLeft" className="-ml-3 mb-2">
            Campaigns
          </ButtonLink>
          <PageHeader title="New campaign" subtitle="Raise for something specific, with a goal donors can watch fill up." />
          <Card>
            <CampaignForm data={data} onDone={(c) => router.push(`${BASE}/campaigns/${c.id}`)} onCancel={() => router.push(`${BASE}/campaigns`)} />
          </Card>
          <div className="mt-4">
            <Callout tone="info">In the live portal a new campaign may need a quick check by the Givezy team before it goes public. That step is an open decision.</Callout>
          </div>
        </div>
      )}
    </Loaded>
  );
}

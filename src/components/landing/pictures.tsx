import { Icon, type IconName } from "@/components/marketing";
import { platformConfig } from "@/config/platform";

/**
 * Sample pictures for the public pages (home, For donors, For charities), drawn in the Givezy look. Every one is a
 * labelled sample: made-up figures and no real charity names. Decoration for sighted visitors, with a short caption
 * for screen readers.
 */

function SampleTag() {
  return <span className="shrink-0 rounded-full bg-honey-soft px-2.5 py-1 text-[12px] font-semibold text-brand">Sample</span>;
}

/** A phone frame, for app pictures. */
function Phone({ children, caption, className = "" }: { children: React.ReactNode; caption: string; className?: string }) {
  return (
    <figure className={`relative mx-auto w-full max-w-[22rem] ${className}`}>
      <div className="rounded-[2.5rem] border-[10px] border-navy bg-white p-5 shadow-[0_40px_80px_rgba(14,27,61,0.18)]">{children}</div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

/** A white card on a soft splash, for website pictures. */
function Panel({ children, caption, className = "" }: { children: React.ReactNode; caption: string; className?: string }) {
  return (
    <figure className={`relative mx-auto w-full max-w-[26rem] ${className}`}>
      <div className="rounded-[1.75rem] border-[1.5px] border-border bg-white p-6 shadow-[0_40px_80px_rgba(14,27,61,0.12)]">{children}</div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

const gifts = [
  { date: "02/10/2026", name: "A food parcel charity", tag: "s18A receipt", amount: "R500" },
  { date: "28/09/2026", name: "A school charity", tag: "once-off", amount: "R250" },
  { date: "19/09/2026", name: "An old-age home", tag: "monthly", amount: "R180" },
  { date: "05/09/2026", name: "A medical support charity", tag: "s18A receipt", amount: "R360" },
];

/** The giver's picture: a phone with a sample giving history. */
export function PhonePicture() {
  return (
    <div className="relative">
      <span aria-hidden className="absolute -left-4 top-10 -z-10 h-40 w-40 rounded-full bg-peach sm:-left-8" />
      <span aria-hidden className="absolute -right-2 bottom-6 -z-10 h-24 w-24 rounded-full bg-honey sm:-right-6" />
      <Phone caption="A sample of the giving history in the Givezy app.">
        <div className="flex items-center justify-between">
          <p className="font-display text-[1.25rem] font-bold">Your giving</p>
          <SampleTag />
        </div>
        <div className="mt-4 rounded-[1.25rem] bg-brand p-4 text-white">
          <p className="text-[13px] opacity-80">This tax year</p>
          <p className="font-display text-[2rem] font-extrabold leading-tight">R1 290</p>
          <p className="text-[13px] opacity-80">2 s18A receipts ready</p>
        </div>
        <ul className="mt-3 flex flex-col">
          {gifts.map((g) => (
            <li key={g.date} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[14px] font-semibold">{g.name}</span>
                <span className="text-[12px] text-muted">{g.date}, {g.tag}</span>
              </span>
              <span className="shrink-0 text-[14px] font-bold">{g.amount}</span>
            </li>
          ))}
        </ul>
      </Phone>
    </div>
  );
}

const needs: { icon: IconName; text: string }[] = [
  { icon: "heart", text: "3 new donors to thank" },
  { icon: "receipt", text: "2 donors need to add s18A details" },
  { icon: "repeat", text: "1 monthly card was declined" },
];

/** The charity's picture: a sample "Needs you this week" card from the dashboard. */
export function DashboardPicture() {
  return (
    <div className="relative">
      <span aria-hidden className="absolute -right-2 -top-8 -z-10 h-36 w-36 rounded-full bg-brand sm:-right-8" />
      <span aria-hidden className="absolute -bottom-6 left-6 -z-10 h-20 w-20 rounded-full bg-peach" />
      <Panel caption="A sample of the charity dashboard on Givezy." className="max-w-[28rem]">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-[1.25rem] font-bold">Needs you this week</p>
          <SampleTag />
        </div>
        <ul className="mt-4 flex flex-col gap-2.5">
          {needs.map((n) => (
            <li key={n.text} className="flex items-center gap-3 rounded-[1rem] bg-honey-soft px-4 py-3">
              <Icon name={n.icon} className="shrink-0 stroke-brand" size={20} />
              <span className="min-w-0 flex-1 text-[15px] font-semibold">{n.text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-[1rem] border-[1.5px] border-border px-4 py-3">
          <span className="text-[14px] text-muted">s18A receipts for 2027</span>
          <span className="text-[14px] font-bold text-success">Ready to approve</span>
        </div>
      </Panel>
    </div>
  );
}

/** A monthly gift in the donor's account, with Pause and Stop. */
export function MonthlyPicture() {
  return (
    <div className="relative">
      <span aria-hidden className="absolute -left-4 -top-6 -z-10 h-32 w-32 rounded-full bg-honey sm:-left-10" />
      <Panel caption="A sample monthly donation in a donor's account, with Pause and Stop.">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-[1.25rem] font-bold">Monthly donation</p>
          <SampleTag />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand font-display text-[1rem] font-bold text-white">SK</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-semibold">A soup kitchen</span>
            <span className="text-[13px] text-muted">Every month on the 3rd</span>
          </span>
          <span className="font-display text-[1.375rem] font-extrabold">R180</span>
        </div>
        <p className="mt-4 flex items-center gap-2 rounded-[1rem] bg-success-soft px-4 py-2.5 text-[14px] font-semibold text-success">
          <Icon name="check" className="stroke-success" size={18} />
          Running. Next gift 03/12/2026
        </p>
        <div aria-hidden className="mt-4 grid grid-cols-2 gap-2.5">
          <span className="flex min-h-11 items-center justify-center rounded-[1.125rem] border-2 border-border text-[15px] font-bold">Pause</span>
          <span className="flex min-h-11 items-center justify-center rounded-[1.125rem] border-2 border-border text-[15px] font-bold">Stop</span>
        </div>
      </Panel>
    </div>
  );
}

/** A gift given in someone's name, or anonymously. */
export function TributePicture() {
  return (
    <div className="relative">
      <span aria-hidden className="absolute -right-2 -top-6 -z-10 h-28 w-28 rounded-full bg-peach sm:-right-8" />
      <Panel caption="A sample of giving in someone's name, or anonymously.">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-[1.25rem] font-bold">Who is it for?</p>
          <SampleTag />
        </div>
        <div aria-hidden className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-brand px-4 py-2 text-[14px] font-bold text-white">In memory of</span>
          <span className="rounded-full border-2 border-border px-4 py-1.5 text-[14px] font-bold">In honour of</span>
        </div>
        <p className="mt-4 rounded-[1rem] border-[1.5px] border-brand bg-white px-4 py-3 text-[15px] font-semibold">A name you choose</p>
        <p className="mt-4 flex items-center gap-3 text-[15px]">
          <span aria-hidden className="relative h-6 w-11 shrink-0 rounded-full bg-brand"><span className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white" /></span>
          Give anonymously
        </p>
        <p className="mt-2 text-[13px] text-muted">Your name won&apos;t show on public pages or live totals.</p>
      </Panel>
    </div>
  );
}

/** An s18A receipt, as a donor sees it in their account. */
export function ReceiptPicture() {
  return (
    <div className="relative">
      <span aria-hidden className="absolute -left-4 bottom-4 -z-10 h-36 w-36 rounded-full bg-honey sm:-left-10" />
      <span aria-hidden className="absolute -right-2 -top-4 -z-10 h-14 w-14 rounded-full bg-coral sm:-right-6" />
      <Panel caption="A sample s18A receipt in a donor's account.">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-[1.25rem] font-bold">s18A receipt</p>
          <SampleTag />
        </div>
        <p className="mt-1 text-[13px] text-muted">Tax year 01/03/2026 to 28/02/2027</p>
        <ul className="mt-4 flex flex-col text-[14px]">
          <li className="flex justify-between border-b border-border py-2"><span>A school charity</span><span className="font-bold">R1 250</span></li>
          <li className="flex justify-between border-b border-border py-2"><span>A food parcel charity</span><span className="font-bold">R2 160</span></li>
        </ul>
        <p className="mt-4 flex items-center gap-2 text-[14px] font-semibold">
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-success-soft"><Icon name="check" className="stroke-success" size={16} /></span>
          One receipt from each charity, once a year
        </p>
        <span aria-hidden className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-[1.125rem] bg-brand text-[15px] font-bold text-white">
          <Icon name="download" className="stroke-white" size={18} />
          Download
        </span>
      </Panel>
    </div>
  );
}

/** The payment provider's secure page, as a donor sees the hand-over. */
export function SecurePagePicture() {
  return (
    <div className="relative">
      <Panel caption="A sample of the payment provider's secure card page.">
        <div className="flex items-center gap-2 rounded-full bg-honey-soft px-4 py-2 text-[13px] text-muted">
          <Icon name="lock" className="shrink-0 stroke-success" size={16} />
          <span className="truncate">The payment provider&apos;s secure page</span>
        </div>
        <div aria-hidden className="mt-5 flex flex-col gap-2.5">
          <span className="h-11 rounded-[1rem] border-[1.5px] border-border" />
          <span className="grid grid-cols-2 gap-2.5"><span className="h-11 rounded-[1rem] border-[1.5px] border-border" /><span className="h-11 rounded-[1rem] border-[1.5px] border-border" /></span>
        </div>
        <p className="mt-5 text-[14px] leading-relaxed text-muted">Your card is typed here, not on {platformConfig.appName}. We only hear back that the gift went through.</p>
      </Panel>
    </div>
  );
}

/** A charity's badges: checked, and whether it issues s18A receipts. */
export function CheckedPicture() {
  return (
    <div className="relative">
      <span aria-hidden className="absolute -left-2 -top-6 -z-10 h-28 w-28 rounded-full bg-brand sm:-left-8" />
      <span aria-hidden className="absolute -bottom-4 right-8 -z-10 h-16 w-16 rounded-full bg-peach" />
      <Panel caption="A sample charity card with its Verified and s18A badges.">
        <div aria-hidden className="h-24 rounded-[1.25rem] bg-peach" />
        <div className="-mt-7 ml-4 flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-white bg-brand font-display text-[1rem] font-bold text-white">CK</div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="font-display text-[1.25rem] font-bold">A community kitchen</p>
          <SampleTag />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[13px] font-semibold">
          <span className="rounded-full bg-brand-soft px-3 py-1 text-brand">Verified</span>
          <span className="flex items-center gap-1 rounded-full border-[1.5px] border-sage px-3 py-1 text-success">
            <Icon name="check" className="stroke-success" size={14} />
            s18A receipts
          </span>
        </div>
      </Panel>
    </div>
  );
}

/** The app's goal ring for the tax year. */
export function GoalPicture() {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative">
      <span aria-hidden className="absolute -right-2 top-10 -z-10 h-40 w-40 rounded-full bg-honey sm:-right-10" />
      <span aria-hidden className="absolute -left-2 bottom-10 -z-10 h-16 w-16 rounded-full bg-coral sm:-left-6" />
      <Phone caption="A sample giving goal in the Givezy app.">
        <div className="flex items-center justify-between">
          <p className="font-display text-[1.25rem] font-bold">Your goal</p>
          <SampleTag />
        </div>
        <div className="mt-4 flex flex-col items-center gap-2">
          <svg aria-hidden viewBox="0 0 128 128" width="150" height="150">
            <circle cx="64" cy="64" r={r} fill="none" stroke="var(--border)" strokeWidth="14" />
            <circle cx="64" cy="64" r={r} fill="none" stroke="var(--coral)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${c * 0.62} ${c}`} transform="rotate(-90 64 64)" />
          </svg>
          <p className="font-display text-[1.75rem] font-extrabold leading-none">R3 100</p>
          <p className="text-[13px] text-muted">of R5 000 this tax year</p>
        </div>
        <ul className="mt-4 flex flex-wrap justify-center gap-2 text-[13px] font-semibold">
          <li className="rounded-full bg-honey-soft px-3 py-1.5">Food and welfare</li>
          <li className="rounded-full bg-honey-soft px-3 py-1.5">Education</li>
        </ul>
      </Phone>
    </div>
  );
}

/** A charity's update with a thank-you, as a donor sees it. */
export function UpdatePicture() {
  return (
    <div className="relative">
      <span aria-hidden className="absolute -left-2 -top-6 -z-10 h-24 w-24 rounded-full bg-peach sm:-left-8" />
      <Panel caption="A sample update from a charity, with a video and a campaign goal.">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-[1.25rem] font-bold">News from your charities</p>
          <SampleTag />
        </div>
        <div aria-hidden className="relative mt-4 flex h-32 items-center justify-center rounded-[1.25rem] bg-brand">
          <span className="absolute -right-4 -top-4 h-16 w-16 rounded-full border-[8px] border-white/20" />
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white">
            <svg viewBox="0 0 24 24" width="20" height="20" className="fill-brand"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </div>
        <p className="mt-3 text-[15px] font-semibold">The new classroom is open</p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-border" aria-hidden><div className="h-2.5 w-[68%] rounded-full bg-sage" /></div>
        <p className="mt-2 flex justify-between text-[13px]"><span className="font-bold">R34 000</span><span className="text-muted">of R50 000</span></p>
      </Panel>
    </div>
  );
}

/** The charity's getting-started list. */
export function ChecklistPicture() {
  const steps = [
    { text: "Add your logo and a cover photo", done: true },
    { text: "Tell donors what you do", done: true },
    { text: "Write your thank-you note", done: false },
    { text: "Bank details saved and checked", done: false },
  ];
  return (
    <div className="relative">
      <span aria-hidden className="absolute -right-2 -top-6 -z-10 h-28 w-28 rounded-full bg-honey sm:-right-8" />
      <Panel caption="A sample of the getting started list in the charity dashboard.">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-[1.25rem] font-bold">Getting started</p>
          <SampleTag />
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-border" aria-hidden><div className="h-2.5 w-1/2 rounded-full bg-brand" /></div>
        <ul className="mt-4 flex flex-col gap-2.5">
          {steps.map((s) => (
            <li key={s.text} className="flex items-center gap-3 text-[15px]">
              <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-success-soft" : "border-2 border-border"}`}>
                {s.done ? <Icon name="check" className="stroke-success" size={16} /> : null}
              </span>
              <span className={s.done ? "text-muted line-through" : "font-semibold"}>{s.text}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

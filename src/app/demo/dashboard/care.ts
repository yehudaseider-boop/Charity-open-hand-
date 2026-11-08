/**
 * The demo's sample follow-ups, tags and notes (made up, like everything in the demo). Every fourth donor starts
 * with some, so a visitor sees a donor the charity already knows well and one it doesn't. Dates count from today,
 * so the demo always looks current. Pure, so the donors list and the donor page agree.
 */
export type DemoCare = {
  notes: { id: string; body: string; at: string; editedAt: string | null }[];
  tags: string[];
  followUps: { id: string; what: string; dueOn: string; doneAt: string | null }[];
};

export const DEMO_TAGS = ["Volunteer", "Board member", "Open day 2026", "Prefers email", "Company giving", "Winter drive"];

const NOTES = [
  "Met at the open day. Keen to help with the winter drive and asked for a copy of the annual report.",
  "Called to say thank you for the monthly donation. Prefers email to phone calls.",
  "Gives through their company each year. The finance contact asked for s18A receipts in the company's name.",
];
const FOLLOW_UPS = ["Call to say thank you", "Send the annual report", "Invite to the year-end event"];

/** yyyy-mm-dd, `days` from `today` (also yyyy-mm-dd). */
function addDays(today: string, days: number): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** dd/mm/yyyy 09:30 for a sample note written `daysAgo` days before today. */
function noteAt(today: string, daysAgo: number): string {
  const [y, m, d] = addDays(today, -daysAgo).split("-");
  return `${d}/${m}/${y} 09:30`;
}

export function demoCareSeed(donorIndex: number, today: string): DemoCare {
  if (donorIndex % 4 !== 0) return { notes: [], tags: [], followUps: [] };
  const k = (donorIndex / 4) % 3;
  return {
    notes: [{ id: `seed-n${donorIndex}`, body: NOTES[k], at: noteAt(today, 12 + k * 5), editedAt: null }],
    tags: [DEMO_TAGS[k * 2], DEMO_TAGS[k * 2 + 1]],
    followUps: [{ id: `seed-f${donorIndex}`, what: FOLLOW_UPS[k], dueOn: addDays(today, k === 0 ? 0 : k * 3), doneAt: null }],
  };
}

/** The donor's position in the demo's list, from its id ("demo-donor-12" is 12), or -1. */
export function demoDonorIndex(id: string): number {
  const m = /^demo-donor-(\d+)$/.exec(id);
  return m ? Number(m[1]) : -1;
}

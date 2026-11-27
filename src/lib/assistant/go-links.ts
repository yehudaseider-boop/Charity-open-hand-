/**
 * Givy's "take me there" buttons (27/11/2026, Yehuda chose it): under an answer, up to two buttons to the exact
 * dashboard page and filter that shows what Givy just looked up, so an answer leads straight to acting on it.
 *
 * Chosen by the server, never by the model: each button comes from a lookup that actually ran, with its own checked
 * inputs, and is one of the fixed pages below. A page the person's role can't open is never offered. The buttons travel
 * in the server's own end-of-answer marker as `go_<key>` names (the model's words can never write a marker).
 * Pure: the route, the panel and the tests share it.
 */

export const GO = {
  overview: { label: "Open the overview", path: "" },
  donations: { label: "Open Donations", path: "/donations" },
  monthly: { label: "Open Monthly donations", path: "/monthly" },
  monthly_declined: { label: "See the declined ones", path: "/monthly?show=declined" },
  monthly_paused: { label: "See the paused ones", path: "/monthly?show=paused" },
  monthly_stopped: { label: "See who stopped", path: "/monthly/stopped" },
  receipts: { label: "Open s18A receipts", path: "/receipts" },
  donors: { label: "Open Donors", path: "/donors" },
  donors_new: { label: "See new donors", path: "/donors?group=new" },
  donors_s18a_asked: { label: "See who asked for one", path: "/donors?s18a=asked" },
  donors_s18a_missing: { label: "See whose details are missing", path: "/donors?s18a=details_missing" },
} as const;

export type GoKey = keyof typeof GO;
const isGoKey = (k: string): k is GoKey => Object.prototype.hasOwnProperty.call(GO, k);

/** At most this many buttons under one answer. */
export const MAX_GO = 2;

/** The buttons a lookup earns, best first, from its checked inputs. */
export function goFor(name: string, input: unknown): GoKey[] {
  const list = (input as { list?: unknown } | null)?.list;
  switch (name) {
    case "giving_totals":
    case "recent_gifts":
      return ["donations"];
    case "giving_by_month":
      return ["overview", "donations"];
    case "monthly_donations":
      return ["monthly", "monthly_declined"];
    case "setup_progress":
      return ["overview"];
    case "receipts_progress":
      return ["receipts", "donors_s18a_missing"];
    case "top_donors":
    case "find_donor":
    case "donor_giving":
    case "donor_contact":
      return ["donors"];
    case "donor_list":
      switch (list) {
        case "stopped_monthly":
          return ["monthly_stopped"];
        case "paused_monthly":
          return ["monthly_paused"];
        case "gives_monthly":
          return ["monthly"];
        case "first_gift_this_month":
        case "first_gift_last_month":
        case "first_gift_this_tax_year":
          return ["donors_new", "donors"];
        case "s18a_asked":
          return ["donors_s18a_asked"];
        case "s18a_details_missing":
          return ["donors_s18a_missing"];
        default:
          return ["donors"];
      }
    default:
      // The thank-you tools have their own "Check and send" button.
      return [];
  }
}

/**
 * The buttons for an answer: from the lookups that ran, in order, no repeats, none to a page this person can't open
 * (`hidden`: the dashboard's hidden pages for their role, such as "/receipts"), at most MAX_GO.
 */
export function goKeys(calls: readonly { name: string; input: unknown }[], hidden: readonly string[] = []): GoKey[] {
  const out: GoKey[] = [];
  for (const c of calls) {
    for (const k of goFor(c.name, c.input)) {
      const page = GO[k].path.split("?")[0].split("/").slice(0, 2).join("/");
      if (out.includes(k) || (page && hidden.includes(page))) continue;
      out.push(k);
      if (out.length === MAX_GO) return out;
    }
  }
  return out;
}

/** The buttons as names in the end-of-answer marker. */
export const goMarkNames = (keys: readonly GoKey[]) => keys.map((k) => `go_${k}`);

/** The buttons read back from the marker's names (anything else is ignored). */
export function goFromNames(names: readonly string[]): GoKey[] {
  return names.flatMap((n) => {
    const k = n.startsWith("go_") ? n.slice(3) : "";
    return k && isGoKey(k) ? [k] : [];
  });
}

/** A button's address on this dashboard (the real one, or the demo's). */
export const goHref = (base: string, key: GoKey) => `${base}${GO[key].path}`;

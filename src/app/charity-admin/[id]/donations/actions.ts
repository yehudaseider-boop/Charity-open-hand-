"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireCharityDashboard } from "@/lib/charity/dashboard";
import { cleanDonorSearch, donationFiltersQuery, parseDonationFilters, searchCookieName } from "@/lib/charity/donation-filters";

/**
 * Apply the filters. A donor's name or email is personal data, so the search
 * goes into a short-lived cookie for this page rather than into the address,
 * where it would end up in browser history and server logs.
 */
export async function applyDonationFilters(charityId: string, formData: FormData) {
  const path = `/charity-admin/${charityId}/donations`;
  await requireCharityDashboard(charityId, path);

  const fields = Object.fromEntries(
    ["status", "18a", "campaign", "from", "to"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const filters = parseDonationFilters(fields);
  const search = formData.get("clear_search") === "1" ? "" : cleanDonorSearch(formData.get("search"));

  const jar = await cookies();
  const name = searchCookieName(charityId);
  if (search) {
    jar.set(name, search, { path, httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 30 * 60 });
  } else {
    jar.delete({ name, path });
  }
  redirect(`${path}${donationFiltersQuery(filters, 1)}`);
}

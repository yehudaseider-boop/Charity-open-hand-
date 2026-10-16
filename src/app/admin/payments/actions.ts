"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { reverseDonation, type ReverseKind } from "@/lib/donations/reverse";
import { isUuid } from "@/lib/ids";

/** A platform admin marks a paid donation refunded or charged back, after checking it in the gateway's dashboard. Logged. */
export async function markDonation(donationId: string, kind: ReverseKind): Promise<void> {
  const viewer = await requirePlatformAdmin();
  if (!isUuid(donationId) || (kind !== "refunded" && kind !== "charged_back")) return;
  await reverseDonation(donationId, kind, viewer.userId, "marked by a platform admin");
  revalidatePath("/admin/payments");
}

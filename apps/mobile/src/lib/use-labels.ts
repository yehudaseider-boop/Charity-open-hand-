import { gifts as sampleGifts, givenElsewhere as sampleElsewhere } from "@/data/giving";
import { useAccount } from "./account";
import { knownLabels } from "./goals";

/** One-tap labels: the donor's own, most used first. */
export function useLabelSuggestions(): string[] {
  const account = useAccount();
  const preview = account.status === "preview";
  const rows = preview ? [...sampleGifts, ...sampleElsewhere] : [...(account.live?.gifts ?? []), ...(account.live?.elsewhere ?? [])];
  return knownLabels(rows);
}

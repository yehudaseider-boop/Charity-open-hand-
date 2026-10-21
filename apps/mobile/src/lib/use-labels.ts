import { gifts as sampleGifts, givenElsewhere as sampleElsewhere } from "@/data/giving";
import { JEWISH_LABELS } from "@shared/donations/labels";
import { useAccount } from "./account";
import { knownLabels } from "./goals";
import { useJewishMode } from "./jewish-mode";

/** One-tap labels: the donor's own, most used first, plus Maaser, Chomesh and Tzedaka with the Jewish switch on. */
export function useLabelSuggestions(): string[] {
  const account = useAccount();
  const jewish = useJewishMode();
  const preview = account.status === "preview";
  const rows = preview ? [...sampleGifts, ...sampleElsewhere] : [...(account.live?.gifts ?? []), ...(account.live?.elsewhere ?? [])];
  return knownLabels(rows, jewish ? JEWISH_LABELS : []);
}

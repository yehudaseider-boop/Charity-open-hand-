/**
 * Told to the donor when a monthly payment could not be collected. DRAFT WORDING for Yehuda's review.
 */
export function monthlyFailedEmail(d: { charityName: string; totalText: string; cardLast4: string | null; final: boolean; manageUrl?: string }) {
  const card = d.cardLast4 ? `your card ending ${d.cardLast4}` : "your card";
  const lines = d.final
    ? [
        `We could not collect your monthly donation of ${d.totalText} to ${d.charityName} from ${card}, and we have tried several times this month.`,
        "",
        "We have stopped your monthly donation so nothing more is charged. To carry on giving monthly, start a new monthly donation on the charity's page, with a card that can be charged.",
      ]
    : [
        `We could not collect your monthly donation of ${d.totalText} to ${d.charityName} from ${card}.`,
        "",
        "We will try again shortly. If the card has expired or been replaced, please start a new monthly donation on the charity's page.",
      ];
  lines.push("", `You can pause or cancel a monthly donation at any time in the Givezy app (Giving tab)${d.manageUrl ? ` or at ${d.manageUrl}` : ""}.`, "", "Givezy");
  return { subject: d.final ? `Your monthly donation to ${d.charityName} has stopped` : `We could not collect your monthly donation to ${d.charityName}`, text: lines.join("\n") };
}

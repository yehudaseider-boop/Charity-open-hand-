/**
 * Told to the donor when a monthly payment could not be collected. DRAFT WORDING for Yehuda's review.
 * Says what happened and what didn't ("nothing more is charged"), gives one next step (put in a new card,
 * which carries the same monthly donation on), and a way to reach a person when we have an address.
 */
export function monthlyFailedEmail(d: {
  charityName: string;
  totalText: string;
  cardLast4: string | null;
  final: boolean;
  manageUrl?: string;
  /** The donor's own "Update my card" link (signed, for this monthly donation only). */
  newCardUrl?: string;
  /** Givezy's support address, once there is one. */
  helpEmail?: string | null;
}) {
  const card = d.cardLast4 ? `your card ending ${d.cardLast4}` : "your card";
  const newCard = d.newCardUrl
    ? `To use a different card, put it in here. This month's ${d.totalText} is paid with it, and your monthly donation carries on as before:\n${d.newCardUrl}`
    : null;
  const lines = d.final
    ? [
        `We could not collect your monthly donation of ${d.totalText} to ${d.charityName} from ${card}. We tried three times this month.`,
        "",
        "We have stopped your monthly donation, so nothing more will be charged to that card.",
        ...(newCard ? ["", newCard] : ["", "To carry on giving monthly, start a new monthly donation on the charity's page."]),
      ]
    : [
        `We could not collect your monthly donation of ${d.totalText} to ${d.charityName} from ${card}. Nothing was charged.`,
        "",
        "We will try the same card again in a day or so.",
        ...(newCard ? ["", newCard] : []),
      ];
  lines.push("", `You can pause or cancel a monthly donation at any time in the Givezy app (Giving tab)${d.manageUrl ? ` or at ${d.manageUrl}` : ""}.`);
  if (d.helpEmail) lines.push("", `Questions? Email us at ${d.helpEmail} and a person will help.`);
  lines.push("", "Givezy");
  return { subject: d.final ? `Your monthly donation to ${d.charityName} has stopped` : `We could not collect your monthly donation to ${d.charityName}`, text: lines.join("\n") };
}

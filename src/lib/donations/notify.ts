import "server-only";

/**
 * Called once when a donation is confirmed paid.
 * STUB: the donor's payment confirmation email and the charity's
 * notification are sent once the email provider is connected (milestone 4).
 */
export async function notifyDonationPaid(donationId: string) {
  console.info(`[notify] donation ${donationId} paid: donor confirmation and charity notice pending email setup`);
}

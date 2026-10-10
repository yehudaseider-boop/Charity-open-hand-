import { Badge } from "@/components/badge";
import { charityBadges, type BadgeFields } from "@/lib/charities";

export function CharityBadges({ charity }: { charity: BadgeFields }) {
  const b = charityBadges(charity);
  return (
    <>
      {b.verified ? <Badge tone="brand">Verified</Badge> : null}
      {b.s18a ? <Badge tone="success">s18A</Badge> : null}
      {b.noReceipts ? <Badge tone="warning">No 18A receipts</Badge> : null}
    </>
  );
}

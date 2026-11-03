import { shareImage, shareImageSize, shareImageType } from "@/lib/seo/share-image";

export const alt = "Find a charity on Givezy";
export const size = shareImageSize;
export const contentType = shareImageType;

export default function Image() {
  return shareImage({
    headline: ["Find a", { blue: "charity" }],
    subline: "Registered South African charities, checked by us before they can take a gift.",
    art: { person: "findingTheWay" },
  });
}

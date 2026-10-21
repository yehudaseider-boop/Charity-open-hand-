import { hebrewStart } from "@/lib/donations/dedication";

/**
 * Text that may carry a Hebrew name after English words ("In memory of חיים כהן"): the Hebrew run is
 * set right to left in Heebo from its first Hebrew letter, and the English before it stays as it is.
 */
export function HebrewAware({ text }: { text: string }) {
  const at = hebrewStart(text);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span lang="he" dir="rtl" className="font-hebrew">{text.slice(at)}</span>
    </>
  );
}

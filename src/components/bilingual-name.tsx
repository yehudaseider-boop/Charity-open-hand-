/** English name with the Hebrew name beneath it, rendered right-to-left. */
export function BilingualName({
  en,
  he,
  as: Tag = "span",
  className = "",
}: {
  en: string;
  he?: string | null;
  as?: "span" | "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <Tag className={`flex flex-col ${className}`}>
      <span>{en}</span>
      {he ? (
        <span lang="he" dir="rtl" className="text-muted text-[0.9em] font-normal text-start">
          {he}
        </span>
      ) : null}
    </Tag>
  );
}

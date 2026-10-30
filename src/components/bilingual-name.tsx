/** A charity's name, as donors see it (English only; any older second-language name is not shown). */
export function BilingualName({
  en,
  as: Tag = "span",
  className = "",
}: {
  en: string;
  as?: "span" | "h1" | "h2" | "h3";
  className?: string;
}) {
  return <Tag className={className}>{en}</Tag>;
}

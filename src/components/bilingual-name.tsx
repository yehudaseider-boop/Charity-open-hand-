/**
 * A charity's name. The platform is English only (Yehuda, 08/10/2026), so a
 * Hebrew name, if one was stored earlier, is not shown.
 */
export function BilingualName({
  en,
  as: Tag = "span",
  className = "",
}: {
  en: string;
  he?: string | null;
  as?: "span" | "h1" | "h2" | "h3";
  className?: string;
}) {
  return <Tag className={className}>{en}</Tag>;
}

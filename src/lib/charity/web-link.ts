/**
 * A charity's website, only when it is safe to show as a link: an http:// or https:// address with no spaces. The
 * database checks new values (charity_website_shape, 20261112100002), but that check was added NOT VALID, so an older
 * row may still hold something else (for example a "javascript:" link). Anything else shows no link at all.
 */
export function webLink(value: string | null | undefined): string | null {
  if (!value || !/^https?:\/\/\S+$/i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Whether search engines may list this site. Off unless SITE_INDEXING=yes, so the test site
 * (test.givezy.co.za) never shows up in Google in place of the real one. Turn it on only on the
 * live site, at launch (see docs/go-live-checklist.md).
 */
export function siteIndexable(): boolean {
  return process.env.SITE_INDEXING === "yes";
}

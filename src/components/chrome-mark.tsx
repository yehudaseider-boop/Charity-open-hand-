/**
 * Tells the layout's header and footer which look to show (see site-header.tsx): "focus" for a charity's own link,
 * "demo" for the dashboard demo,
 * "landing" for the landing page, which brings its own small header and footer. An empty element that CSS looks for (body:has), so the right header shows from
 * the first paint, with no script and no request read in the shared layout.
 */
export function ChromeMark({ kind }: { kind: "focus" | "demo" | "landing" }) {
  return <span hidden data-chrome={kind} />;
}

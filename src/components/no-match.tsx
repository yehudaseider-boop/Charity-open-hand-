import Link from "next/link";

/** A search or filter that found nothing: the same words and the same way back on every list. */
export function NoMatch({ what, clearHref }: { what: string; clearHref: string }) {
  return (
    <>
      No {what} match your search or filters.{" "}
      <Link href={clearHref} className="text-brand underline">Clear the search and filters</Link>
    </>
  );
}

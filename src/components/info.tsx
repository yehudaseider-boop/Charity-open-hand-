import { glossary, type GlossaryTerm } from "@/lib/glossary";

/**
 * A small "i" that opens a plain-English explanation of a term (maaser,
 * chomesh, s18A...). Built on <details>, so it works without JavaScript and
 * with screen readers.
 */
export function Info({ terms, label }: { terms: GlossaryTerm[]; label?: string }) {
  const name = label ?? glossary[terms[0]].title;
  return (
    <details className="group text-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-brand [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full border border-brand text-xs font-bold">i</span>
        <span className="underline">What is {name}?</span>
      </summary>
      <div className="mt-2 space-y-3 rounded-control border border-border bg-bg p-3">
        {terms.map((t) => (
          <div key={t} className="space-y-1">
            <p className="font-semibold">{glossary[t].title}</p>
            {glossary[t].body.map((p, i) => (
              <p key={i} className="text-muted">{p}</p>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

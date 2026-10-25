export function Card({
  title,
  headingLevel = 2,
  children,
  aside,
}: {
  title?: React.ReactNode;
  /** The title is an h2 unless the card is the page's main heading (h1) or sits under another card (h3). */
  headingLevel?: 1 | 2 | 3;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  // An h1 picks up Bricolage Grotesque and the headline colour from globals.css; like every other page title it is never below text-xl.
  const Heading = `h${headingLevel}` as const;
  return (
    <section className="rounded-card border-2 border-border bg-surface p-5 sm:p-6">
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <Heading className={headingLevel === 1 ? "font-display text-2xl font-bold text-indigo" : "font-display text-xl font-bold text-indigo"}>{title}</Heading>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger"; children: React.ReactNode }) {
  const cls = {
    neutral: "bg-brand-soft text-indigo",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  }[tone];
  return <div className={`rounded-control p-4 text-sm ${cls}`}>{children}</div>;
}

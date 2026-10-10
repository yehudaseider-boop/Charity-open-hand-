export function Card({
  title,
  children,
  aside,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-5">
      {title ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-semibold">{title}</h2>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger"; children: React.ReactNode }) {
  const cls = {
    neutral: "bg-brand-soft text-brand",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  }[tone];
  return <div className={`rounded-control p-3 text-sm ${cls}`}>{children}</div>;
}

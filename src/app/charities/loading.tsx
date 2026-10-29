/** Shown while the charities list loads: the same shapes as the page, so nothing jumps when it arrives. */
export default function Loading() {
  return (
    <div className="full-bleed" aria-busy="true" aria-label="Loading charities">
      <div className="bg-honey-soft">
        <div className="mx-auto max-w-[75rem] space-y-5 px-4 pb-10 pt-10 sm:px-6 sm:pt-14">
          <div className="skeleton h-14 w-72" />
          <div className="skeleton h-5 w-96 max-w-full" />
          <div className="skeleton h-14 max-w-[44rem]" />
          <div className="flex gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10 w-28 rounded-full" />)}</div>
        </div>
      </div>
      <ul className="mx-auto grid max-w-[75rem] gap-4 px-4 py-10 sm:px-6 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex gap-4 rounded-card border-2 border-border p-5">
            <div className="skeleton h-16 w-16 shrink-0" />
            <div className="flex-1 space-y-2"><div className="skeleton h-5 w-2/3" /><div className="skeleton h-4 w-1/3" /><div className="skeleton h-4 w-full" /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

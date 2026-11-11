/** Shown while the charities list loads: the same shapes as the page (headline, search, causes, photo cards), so nothing jumps when it arrives. */
export default function Loading() {
  return (
    <div className="full-bleed overflow-x-clip" aria-busy="true">
      <p role="status" className="sr-only">Loading charities</p>
      <div className="relative isolate">
        <span aria-hidden className="pointer-events-none absolute -left-40 -top-28 -z-10 h-[28rem] w-[28rem] rounded-full bg-honey-soft" />
        <div className="mx-auto flex max-w-[75rem] flex-col gap-5 px-4 pb-8 pt-8 sm:px-6 sm:pb-12 sm:pt-12">
          <div className="skeleton h-16 w-80 max-w-full sm:h-20 sm:w-[28rem]" />
          <div className="skeleton h-5 w-[32rem] max-w-full" />
          <div className="skeleton h-14 max-w-[44rem] rounded-[1.125rem] sm:h-16" />
          <div className="flex gap-2 overflow-hidden">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-11 w-28 shrink-0 rounded-full" />)}</div>
        </div>
      </div>
      <ul className="mx-auto grid max-w-[75rem] gap-5 px-4 pb-12 pt-8 sm:grid-cols-2 sm:px-6 sm:pt-10 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <li key={i} className="overflow-hidden rounded-[1.5rem] border-2 border-border">
            <div className="skeleton aspect-[16/9] w-full rounded-none" />
            <div className="space-y-3 px-5 pb-5">
              <div className="skeleton -mt-8 h-16 w-16 rounded-[1.125rem] shadow-[0_0_0_4px_var(--surface)]" />
              <div className="skeleton h-6 w-2/3" />
              <div className="skeleton h-4 w-1/3" />
              <div className="skeleton h-4 w-full" />
              <div className="flex gap-2"><div className="skeleton h-6 w-24 rounded-full" /><div className="skeleton h-6 w-20 rounded-full" /></div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

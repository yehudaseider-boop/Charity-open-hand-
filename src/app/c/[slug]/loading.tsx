/** Shown while a charity's page loads: the header, the give card and the story, as soft placeholders. */
export default function Loading() {
  return (
    <div className="full-bleed" aria-busy="true" aria-label="Loading the charity">
      <div className="mx-auto max-w-[75rem] px-4 pt-4 sm:px-6 sm:pt-6">
        <div className="skeleton h-36 rounded-[2rem] sm:h-52" />
        <div className="mt-6 flex items-end gap-5 px-4 sm:px-8"><div className="skeleton h-24 w-24 sm:h-32 sm:w-32" /><div className="skeleton h-10 w-80 max-w-full" /></div>
      </div>
      <div className="mx-auto grid max-w-[75rem] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-4"><div className="skeleton h-40" /><div className="skeleton h-6 w-1/2" /><div className="skeleton h-24" /></div>
        <div className="skeleton h-64 rounded-[1.75rem] lg:col-start-2 lg:row-start-1" />
      </div>
    </div>
  );
}

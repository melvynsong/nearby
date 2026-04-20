// Elegant loading skeleton for showcase landing
export default function ShowcaseLandingSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-4 animate-pulse">
      <div className="h-7 w-2/3 bg-neutral-200 rounded mb-2" />
      <div className="h-4 w-1/2 bg-neutral-100 rounded mb-2" />
      <div className="flex gap-2 overflow-x-auto pb-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-7 w-16 bg-neutral-100 rounded-full" />
        ))}
      </div>
      <div className="h-10 w-full bg-neutral-100 rounded mb-2" />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-neutral-100 h-32" />
        ))}
      </div>
    </div>
  )
}

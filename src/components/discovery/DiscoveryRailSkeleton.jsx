// Compact skeleton for a single destination rail while the catalogue loads.
// Card dimensions mirror the real cards so there is no layout shift on settle.
export default function DiscoveryRailSkeleton({ title = "Loading destinations" }) {
  return (
    <section className="mb-8" aria-busy="true" aria-live="polite">
      <div className="max-w-5xl mx-auto px-4 mb-3">
        <span className="block h-5 w-44 rounded bg-white/10 motion-safe:animate-pulse motion-reduce:animate-none" />
        <span className="sr-only">{title}</span>
      </div>
      <div className="flex gap-4 overflow-hidden max-w-5xl mx-auto px-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="shrink-0 w-[230px] sm:w-[290px]">
            <div className="aspect-video w-full rounded-lg bg-white/10 motion-safe:animate-pulse motion-reduce:animate-none" />
            <div className="h-4 w-2/3 rounded bg-white/10 motion-safe:animate-pulse motion-reduce:animate-none mt-2" />
            <div className="h-3 w-1/2 rounded bg-white/10 motion-safe:animate-pulse motion-reduce:animate-none mt-2" />
          </div>
        ))}
      </div>
    </section>
  );
}
// Editorial four-stage pathway replacing the uniform box grid. A single shared
// route line connects the stages; markers carry bold numerals 01–04 (no repeated
// small icon-in-circle design, no per-stage border). Desktop: horizontal; mobile:
// vertical with no horizontal overflow. Neutral colours throughout. The future
// "Travel companion" stage stays readable but slightly quieter. Copy is supplied
// by the parent so this component stays presentational.
export default function JourneyPathway({ steps }) {
  return (
    <div className="relative">
      {/* Spine: horizontal on desktop, vertical on mobile */}
      <div className="hidden sm:block absolute top-7 left-0 right-0 h-px bg-on-dark/15" aria-hidden="true" />
      <div className="sm:hidden absolute left-7 top-3 bottom-3 w-px bg-on-dark/15" aria-hidden="true" />
      <ol className="relative grid sm:grid-cols-4 gap-y-8 sm:gap-y-0 sm:gap-x-6">
        {steps.map((s, i) => {
          const quiet = !!s.coming;
          return (
            <li key={s.title} className="relative flex sm:block gap-4 sm:gap-0">
              <div className="relative z-10 flex-shrink-0">
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center font-display text-base font-bold ring-1 ${
                    quiet
                      ? "bg-cinema text-on-dark/70 ring-on-dark/15"
                      : "bg-cinema text-on-dark ring-on-dark/25"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
              </div>
              <div className="sm:mt-5 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={`font-display font-semibold ${quiet ? "text-on-dark/80" : "text-on-dark"}`}>
                    {s.title}
                  </h3>
                  {s.coming && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-on-dark/10 text-muted-dark px-2 py-0.5 rounded-full">
                      Coming later
                    </span>
                  )}
                </div>
                <p className={`text-sm ${quiet ? "text-muted-dark/80" : "text-muted-dark"}`}>{s.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
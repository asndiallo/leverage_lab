import Link from "next/link";

const OPTIONS = [12, 24, 60];

// Server-rendered: a relative `?horizon=N` href replaces the query on the
// current path — no client hooks (useSearchParams) needed, so it SSRs cleanly.
export function HorizonSelector({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1">
      {OPTIONS.map((n) => (
        <Link
          key={n}
          href={`?horizon=${n}`}
          scroll={false}
          className={`rounded-md px-2 py-1 text-xs ${
            current === n ? "bg-brand text-white" : "text-muted hover:text-ink"
          }`}
        >
          {n}mo
        </Link>
      ))}
    </div>
  );
}

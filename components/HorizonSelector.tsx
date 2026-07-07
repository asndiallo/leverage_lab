import Link from "next/link";
import { cn } from "@/lib/utils";

const OPTIONS = [12, 24, 60];

// Server-rendered: a relative `?horizon=N` href replaces the query on the
// current path — no client hooks (useSearchParams) needed, so it SSRs cleanly.
export function HorizonSelector({ current }: { current: number }) {
  return (
    <div className="bg-muted flex items-center gap-1 rounded-lg p-0.5">
      {OPTIONS.map((n) => (
        <Link
          key={n}
          href={`?horizon=${n}`}
          scroll={false}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            current === n
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {n}mo
        </Link>
      ))}
    </div>
  );
}

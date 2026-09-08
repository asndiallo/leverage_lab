import Link from "next/link";
import { cn } from "@/lib/utils";

// Server-rendered `?scheduleEYear=N` link, same shape as HorizonSelector —
// intentionally replaces the whole query string rather than merging, matching
// that component's existing behavior.
export function ScheduleEYearSelector({
  years,
  current,
}: {
  years: number[];
  current: number;
}) {
  return (
    <div className="bg-muted flex items-center gap-1 rounded-lg p-0.5">
      {years.map((y) => (
        <Link
          key={y}
          href={`?scheduleEYear=${y}`}
          scroll={false}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            current === y
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {y}
        </Link>
      ))}
    </div>
  );
}

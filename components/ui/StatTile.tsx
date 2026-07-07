import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "ink" | "positive" | "negative" | "muted";

const tones: Record<Tone, string> = {
  ink: "text-foreground",
  positive: "text-positive",
  negative: "text-negative",
  muted: "text-muted-foreground",
};

export function StatTile({
  label,
  value,
  sub,
  tone = "ink",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <Card className="gap-1 px-4 py-3.5">
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-xl font-semibold tabular-nums",
          tones[tone],
        )}
      >
        {value}
      </div>
      {sub != null && (
        <div className="text-muted-foreground text-xs">{sub}</div>
      )}
    </Card>
  );
}

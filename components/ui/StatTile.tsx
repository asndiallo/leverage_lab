import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  help,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  help?: string;
}) {
  return (
    <Card className="gap-1 px-4 py-3.5">
      <div className="text-muted-foreground flex items-center gap-1 text-xs font-medium tracking-wide uppercase">
        {label}
        {help && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-3 cursor-help" aria-label={help} />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 normal-case">
              {help}
            </TooltipContent>
          </Tooltip>
        )}
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

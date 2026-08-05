"use client";

import { useId, useMemo, useState } from "react";
import { deleteMarketSnapshot } from "@/lib/actions";
import { computeEquityStats } from "@/lib/equity";
import {
  dateLabel,
  money,
  moneySigned,
  moneyWhole,
  percent,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ConfirmDeleteButton } from "@/components/forms/ConfirmDeleteButton";
import { AddMarketSnapshotForm } from "@/components/forms/AddMarketSnapshotForm";
import type { EquitySeriesPoint } from "@/types/database";

const SOURCE_LABELS: Record<EquitySeriesPoint["source"], string> = {
  purchase: "At purchase",
  manual: "Manual",
  zillow_estimate: "Zillow estimate",
  appraisal: "Appraisal",
};

const VIEW_W = 640;
const VIEW_H = 220;
const PAD = { top: 16, right: 16, bottom: 24, left: 16 };

/** Round step sizes for y-axis ticks, e.g. 25000 -> [0, 25000, 50000]. */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const rawStep = (max - min) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
    magnitude;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step; v += step) ticks.push(v);
  return ticks;
}

export function EquityChart({
  propertyId,
  series,
}: {
  propertyId: string;
  series: EquitySeriesPoint[];
}) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const stats = useMemo(() => computeEquityStats(series), [series]);

  const { points, yTicks, plotH } = useMemo(() => {
    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = VIEW_H - PAD.top - PAD.bottom;
    if (series.length === 0) {
      return { points: [], yTicks: [], plotW, plotH };
    }
    const dates = series.map((s) => new Date(s.snapshot_date).getTime());
    const equities = series.map((s) => s.equity_cents);
    const xMin = Math.min(...dates);
    const xMax = Math.max(...dates);
    const yMin = Math.min(0, ...equities);
    const yMax = Math.max(0, ...equities);
    const yPad = Math.max((yMax - yMin) * 0.1, 100);
    const yLo = yMin - yPad;
    const yHi = yMax + yPad;

    const x = (t: number) =>
      xMax === xMin
        ? PAD.left + plotW / 2
        : PAD.left + ((t - xMin) / (xMax - xMin)) * plotW;
    const y = (v: number) =>
      PAD.top + plotH - ((v - yLo) / (yHi - yLo)) * plotH;

    const points = series.map((s, i) => ({
      ...s,
      cx: x(new Date(s.snapshot_date).getTime()),
      cy: y(s.equity_cents),
      i,
    }));
    const yTicks = niceTicks(yLo, yHi).map((v) => ({ v, cy: y(v) }));
    return { points, yTicks, plotW, plotH };
  }, [series]);

  if (series.length === 0) {
    return (
      <Card className="gap-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Equity</h2>
          <AddMarketSnapshotForm propertyId={propertyId} />
        </div>
        <p className="text-muted-foreground text-sm">No purchase data yet.</p>
      </Card>
    );
  }

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.cx} ${p.cy}`)
    .join(" ");
  const zeroY =
    PAD.top +
    plotH -
    ((0 - (yTicks[0]?.v ?? 0)) /
      ((yTicks[yTicks.length - 1]?.v ?? 1) - (yTicks[0]?.v ?? 0) || 1)) *
      plotH;
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].cx} ${zeroY} L ${points[0].cx} ${zeroY} Z`
      : "";

  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Equity</h2>
          <p className="text-muted-foreground text-xs">
            Value minus loan balance, at purchase and each logged snapshot.
          </p>
        </div>
        <AddMarketSnapshotForm propertyId={propertyId} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Current equity
          </div>
          <div className="font-mono text-lg font-semibold tabular-nums">
            {money(
              stats?.lastEquityCents ?? points[points.length - 1].equity_cents,
            )}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Change since purchase
          </div>
          <div
            className={cn(
              "font-mono text-lg font-semibold tabular-nums",
              (stats?.totalEquityChangeCents ?? 0) < 0
                ? "text-negative"
                : "text-positive",
            )}
          >
            {stats ? moneySigned(stats.totalEquityChangeCents) : "—"}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Value CAGR
          </div>
          <div className="font-mono text-lg font-semibold tabular-nums">
            {stats?.valueCagr != null ? percent(stats.valueCagr) : "—"}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Equity CAGR
          </div>
          <div className="font-mono text-lg font-semibold tabular-nums">
            {stats?.equityCagr != null ? percent(stats.equityCagr) : "—"}
          </div>
          {stats && stats.equityCagr == null && (
            <div className="text-muted-foreground text-xs">
              Not defined while equity is negative
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full"
          role="img"
          aria-label="Property equity over time"
          onPointerLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-primary)"
                stopOpacity="0.12"
              />
              <stop
                offset="100%"
                stopColor="var(--color-primary)"
                stopOpacity="0.02"
              />
            </linearGradient>
          </defs>

          {yTicks.map((t) => (
            <g key={t.v}>
              <line
                x1={PAD.left}
                x2={VIEW_W - PAD.right}
                y1={t.cy}
                y2={t.cy}
                stroke="var(--color-border)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={PAD.left}
                y={t.cy - 4}
                className="fill-muted-foreground"
                fontSize={9}
              >
                {moneyWhole(t.v)}
              </text>
            </g>
          ))}

          {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {hovered && (
            <line
              x1={hovered.cx}
              x2={hovered.cx}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--color-muted-foreground)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {points.map((p) => (
            <g key={p.id ?? "purchase"}>
              <circle
                cx={p.cx}
                cy={p.cy}
                r={5}
                fill="var(--color-primary)"
                stroke="var(--color-card)"
                strokeWidth={2}
              />
              <circle
                cx={p.cx}
                cy={p.cy}
                r={12}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${dateLabel(p.snapshot_date)}: equity ${money(p.equity_cents)}`}
                onPointerEnter={() => setHoverIndex(p.i)}
                onFocus={() => setHoverIndex(p.i)}
                onBlur={() => setHoverIndex(null)}
                className="cursor-pointer outline-none"
              />
            </g>
          ))}
        </svg>

        {hovered && (
          <div
            className="border-border bg-popover text-popover-foreground pointer-events-none absolute z-10 min-w-40 rounded-lg border px-3 py-2 text-xs shadow-md"
            style={{
              left: `${(hovered.cx / VIEW_W) * 100}%`,
              top: `${(hovered.cy / VIEW_H) * 100}%`,
              // Center on the point normally, but near either edge anchor to
              // that edge instead so the box never overflows the chart (the
              // rightmost point — usually "current" — is the one readers
              // hover most, and a clipped tooltip there is the worst case).
              transform: `translate(${
                hovered.cx / VIEW_W < 0.15
                  ? "0%"
                  : hovered.cx / VIEW_W > 0.85
                    ? "-100%"
                    : "-50%"
              }, calc(-100% - 12px))`,
            }}
          >
            <div className="text-muted-foreground">
              {dateLabel(hovered.snapshot_date)} ·{" "}
              {SOURCE_LABELS[hovered.source]}
            </div>
            <div className="mt-1 font-mono font-semibold tabular-nums">
              Equity: {money(hovered.equity_cents)}
            </div>
            <div className="text-muted-foreground font-mono tabular-nums">
              Value {money(hovered.value_cents)} − loan{" "}
              {money(hovered.loan_balance_cents)}
            </div>
          </div>
        )}
      </div>

      <table className="w-full text-xs">
        <caption className="sr-only">Equity snapshots over time</caption>
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="py-1.5 font-medium">Date</th>
            <th className="py-1.5 font-medium">Value</th>
            <th className="py-1.5 font-medium">Loan balance</th>
            <th className="py-1.5 font-medium">Equity</th>
            <th className="py-1.5 font-medium">Source</th>
            <th className="py-1.5" />
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().map((p) => (
            <tr key={p.id ?? "purchase"} className="border-b last:border-0">
              <td className="py-1.5">{dateLabel(p.snapshot_date)}</td>
              <td className="py-1.5 font-mono tabular-nums">
                {money(p.value_cents)}
              </td>
              <td className="py-1.5 font-mono tabular-nums">
                {money(p.loan_balance_cents)}
              </td>
              <td className="py-1.5 font-mono tabular-nums">
                {money(p.equity_cents)}
              </td>
              <td className="text-muted-foreground py-1.5">
                {SOURCE_LABELS[p.source]}
              </td>
              <td className="py-1.5 text-right">
                {p.id && (
                  <ConfirmDeleteButton
                    action={deleteMarketSnapshot}
                    hiddenFields={{ id: p.id, property_id: propertyId }}
                    title="Delete this snapshot?"
                    triggerLabel="Delete snapshot"
                    iconOnly
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

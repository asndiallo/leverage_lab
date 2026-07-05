import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { money, moneySigned } from "@/lib/format";
import type { Property, PropertyStatus } from "@/types/database";

const statusVariant: Record<PropertyStatus, "positive" | "warn" | "neutral"> = {
  active: "positive",
  pending: "warn",
  sold: "neutral",
};

export function PropertyCard({
  property,
  cashInvestedCents,
  monthlyNetCents,
  isVacant,
}: {
  property: Property;
  cashInvestedCents: number | null;
  monthlyNetCents: number | null;
  isVacant: boolean;
}) {
  const net = monthlyNetCents ?? 0;
  return (
    <Link
      href={`/properties/${property.id}`}
      className="block rounded-xl border border-border bg-surface p-5 transition hover:border-brand"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{property.address}</div>
          <div className="text-sm text-muted">
            {property.city}, {property.state} {property.zip}
          </div>
        </div>
        <Badge variant={statusVariant[property.status]}>{property.status}</Badge>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Monthly cash flow</div>
          <div
            className={`text-lg font-semibold tabular-nums ${net < 0 ? "text-negative" : "text-positive"}`}
          >
            {moneySigned(monthlyNetCents)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-muted">Cash invested</div>
          <div className="text-lg font-semibold tabular-nums">{money(cashInvestedCents)}</div>
        </div>
      </div>

      <div className="mt-3">
        {isVacant ? (
          <Badge variant="warn">Vacant — no active lease</Badge>
        ) : (
          <Badge variant="positive">Occupied</Badge>
        )}
      </div>
    </Link>
  );
}

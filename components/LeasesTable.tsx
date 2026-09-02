import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditLeaseForm } from "@/components/forms/EditLeaseForm";
import { DeleteLeaseButton } from "@/components/forms/DeleteLeaseButton";
import { dateLabel, money } from "@/lib/format";
import type { Lease, LeaseStatus } from "@/types/database";
import type { LinkedDocument } from "@/lib/queries";

const statusVariant: Record<LeaseStatus, "positive" | "warn" | "outline"> = {
  active: "positive",
  pending: "warn",
  ended: "outline",
};

export function LeasesTable({
  leases,
  documentsByLease,
}: {
  leases: Lease[];
  documentsByLease: Record<string, LinkedDocument[]>;
}) {
  if (leases.length === 0) return null;

  return (
    <Card className="gap-0 p-0">
      <div className="border-b px-5 py-3">
        <h2 className="font-medium">Leases</h2>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Unit</TableHead>
            <TableHead>Tenant</TableHead>
            <TableHead className="text-right">Rent</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="pr-5 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leases.map((lease) => (
            <TableRow key={lease.id}>
              <TableCell className="pl-5">{lease.unit_identifier}</TableCell>
              <TableCell>{lease.tenant_name}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {money(lease.rent_amount_cents)}
              </TableCell>
              <TableCell>{dateLabel(lease.lease_start)}</TableCell>
              <TableCell>
                {lease.lease_end ? dateLabel(lease.lease_end) : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant[lease.status]}>
                  {lease.status}
                </Badge>
              </TableCell>
              <TableCell className="pr-5 text-right">
                <div className="flex justify-end gap-1">
                  <EditLeaseForm
                    lease={lease}
                    documents={documentsByLease[lease.id]}
                  />
                  <DeleteLeaseButton
                    leaseId={lease.id}
                    propertyId={lease.property_id}
                    hasDocuments={(documentsByLease[lease.id]?.length ?? 0) > 0}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

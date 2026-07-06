"use client";

import { Plus } from "lucide-react";
import { addProperty } from "@/lib/actions";
import { Field } from "./formPrimitives";
import { FormDialogButton } from "./FormDialogButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function NewPropertyForm() {
  return (
    <FormDialogButton
      action={addProperty}
      title="New property"
      submitLabel="Add property"
      trigger={
        <Button>
          <Plus className="size-4" />
          Add property
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Address">
          <Input name="address" required />
        </Field>
        <Field label="City">
          <Input name="city" required />
        </Field>
        <Field label="State">
          <Input name="state" required maxLength={2} placeholder="TX" />
        </Field>
        <Field label="ZIP">
          <Input name="zip" required />
        </Field>
        <Field label="CAD account (optional)">
          <Input name="cad_account" />
        </Field>
        <Field label="Parcel ID (optional)">
          <Input name="parcel_id" />
        </Field>
        <Field label="Purchase price ($)">
          <Input name="purchase_price" type="number" step="0.01" min="0" required />
        </Field>
        <Field label="Purchase date">
          <Input name="purchase_date" type="date" required />
        </Field>
        <Field label="Type">
          <Select name="property_type" defaultValue="single_family">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["single_family", "duplex", "triplex", "fourplex", "townhouse", "condo", "other"].map(
                (t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue="pending">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">pending</SelectItem>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="sold">sold</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Separator />
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Loan (optional)
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Lender">
            <Input name="lender" />
          </Field>
          <Field label="Loan amount ($)">
            <Input name="loan_amount" type="number" step="0.01" min="0" />
          </Field>
          <Field label="Interest rate (e.g. 0.055)">
            <Input name="interest_rate" type="number" step="0.0001" min="0" />
          </Field>
          <Field label="Term (years)">
            <Input name="term_years" type="number" step="1" min="1" defaultValue="30" />
          </Field>
          <Field label="Funding date">
            <Input name="funding_date" type="date" />
          </Field>
          <Field label="First payment date">
            <Input name="first_payment_date" type="date" />
          </Field>
        </div>
      </div>
    </FormDialogButton>
  );
}

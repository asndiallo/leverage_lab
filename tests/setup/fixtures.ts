import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { adminClient } from "./supabase";

type Client = SupabaseClient<Database>;
type Tables = Database["public"]["Tables"];

/** Creates the property through the OWNER's own client, so the insert RLS
 * policy and the properties_after_insert_add_creator trigger both fire for
 * real, exactly as they would from the app. */
export async function createTestProperty(
  client: Client,
  userId: string,
  overrides: Partial<Tables["properties"]["Insert"]> = {},
) {
  const { data, error } = await client
    .from("properties")
    .insert({
      user_id: userId,
      address: "1 Test St",
      city: "Testville",
      state: "TX",
      zip: "78108",
      purchase_price_cents: 30_000_000,
      purchase_date: "2026-01-01",
      property_type: "single_family",
      status: "active",
      ...overrides,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("createTestProperty: no row returned");
  return data;
}

/** Deletes a property and (via FK cascade) every row hanging off it. Uses the
 * service-role client so it always succeeds regardless of which test user
 * "owns" it. */
export async function deleteTestProperty(propertyId: string) {
  await adminClient.from("properties").delete().eq("id", propertyId);
}

export async function createTestPropertySettings(
  client: Client,
  userId: string,
  propertyId: string,
  overrides: Partial<Tables["property_settings"]["Insert"]> = {},
) {
  const { data, error } = await client
    .from("property_settings")
    .insert({
      user_id: userId,
      property_id: propertyId,
      ...overrides,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("createTestPropertySettings: no row returned");
  return data;
}

export async function createTestJurisdiction(
  client: Client,
  userId: string,
  propertyId: string,
  overrides: Partial<Tables["taxing_jurisdictions"]["Insert"]> = {},
) {
  const { data, error } = await client
    .from("taxing_jurisdictions")
    .insert({
      user_id: userId,
      property_id: propertyId,
      name: "Test ISD",
      jurisdiction_type: "isd",
      ...overrides,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("createTestJurisdiction: no row returned");
  return data;
}

export async function createTestTaxRate(
  client: Client,
  userId: string,
  jurisdictionId: string,
  overrides: Partial<Tables["tax_rates"]["Insert"]> = {},
) {
  const { data, error } = await client
    .from("tax_rates")
    .insert({
      user_id: userId,
      jurisdiction_id: jurisdictionId,
      tax_year: 2026,
      rate: 0.01,
      ...overrides,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("createTestTaxRate: no row returned");
  return data;
}

export async function createTestAssessedValue(
  client: Client,
  userId: string,
  propertyId: string,
  overrides: Partial<Tables["assessed_values"]["Insert"]> = {},
) {
  const { data, error } = await client
    .from("assessed_values")
    .insert({
      user_id: userId,
      property_id: propertyId,
      tax_year: 2026,
      total_assessed_cents: 30_000_000,
      source: "county_record",
      ...overrides,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("createTestAssessedValue: no row returned");
  return data;
}

export async function createTestExemption(
  client: Client,
  userId: string,
  propertyId: string,
  jurisdictionId: string,
  overrides: Partial<Tables["tax_exemptions"]["Insert"]> = {},
) {
  const { data, error } = await client
    .from("tax_exemptions")
    .insert({
      user_id: userId,
      property_id: propertyId,
      jurisdiction_id: jurisdictionId,
      exemption_type: "homestead",
      calc_method: "flat_amount",
      flat_amount_cents: 1_000_000,
      effective_tax_year: 2026,
      applied: true,
      ...overrides,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("createTestExemption: no row returned");
  return data;
}

export async function createTestLoan(
  client: Client,
  userId: string,
  propertyId: string,
  overrides: Partial<Tables["loans"]["Insert"]> = {},
) {
  const { data, error } = await client
    .from("loans")
    .insert({
      user_id: userId,
      property_id: propertyId,
      loan_type: "original",
      original_amount_cents: 24_000_000,
      interest_rate: 0.055,
      term_months: 360,
      status: "active",
      ...overrides,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("createTestLoan: no row returned");
  return data;
}

export async function createTestEscrow(
  client: Client,
  userId: string,
  propertyId: string,
  overrides: Partial<Tables["escrow_schedules"]["Insert"]> = {},
) {
  const { data, error } = await client
    .from("escrow_schedules")
    .insert({
      user_id: userId,
      property_id: propertyId,
      effective_date: "2026-01-01",
      monthly_tax_escrow_cents: 0,
      monthly_insurance_escrow_cents: 0,
      monthly_hoa_cents: 0,
      ...overrides,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("createTestEscrow: no row returned");
  return data;
}

export async function createTestLease(
  client: Client,
  userId: string,
  propertyId: string,
  overrides: Partial<Tables["leases"]["Insert"]> = {},
) {
  const { data, error } = await client
    .from("leases")
    .insert({
      user_id: userId,
      property_id: propertyId,
      unit_identifier: "unit_a",
      tenant_name: "Test Tenant",
      rent_amount_cents: 150_000,
      lease_start: "2026-01-01",
      status: "active",
      ...overrides,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("createTestLease: no row returned");
  return data;
}

export async function createTestTransaction(
  client: Client,
  userId: string,
  propertyId: string,
  overrides: Partial<Tables["transactions"]["Insert"]> = {},
) {
  const { data, error } = await client
    .from("transactions")
    .insert({
      user_id: userId,
      property_id: propertyId,
      txn_date: "2026-01-01",
      amount_cents: 10_000,
      category: "other_income",
      ...overrides,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("createTestTransaction: no row returned");
  return data;
}

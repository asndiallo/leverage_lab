import { createClient } from "@/lib/supabase/server";
import type {
  Property,
  Loan,
  EscrowSchedule,
  PropertyYields,
  MonthlyCashflow,
  LoanPayment,
  VacancyPeriod,
  EquitySeriesPoint,
  PropertySettings,
} from "@/types/database";

export async function getProperties(): Promise<Property[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getProperty(id: string): Promise<Property | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPortfolioYields(): Promise<PropertyYields[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_property_yields").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function getPropertyYields(
  id: string,
): Promise<PropertyYields | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_property_yields")
    .select("*")
    .eq("property_id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getEquitySeries(
  id: string,
): Promise<EquitySeriesPoint[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("property_equity_series", {
    p_property_id: id,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getVacancyPeriods(id: string): Promise<VacancyPeriod[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vacancy_periods")
    .select("*")
    .eq("property_id", id)
    .order("start_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getPropertySettings(
  id: string,
): Promise<PropertySettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_settings")
    .select("*")
    .eq("property_id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getLoans(id: string): Promise<Loan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loans")
    .select("*")
    .eq("property_id", id)
    .order("funding_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getLoanPayments(id: string): Promise<LoanPayment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_loan_payment")
    .select("*")
    .eq("property_id", id);
  if (error) throw error;
  return data ?? [];
}

export async function getCurrentEscrow(
  id: string,
  asof: string,
): Promise<EscrowSchedule | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("property_current_escrow", {
    p_property_id: id,
    p_asof: asof,
  });
  if (error) throw error;
  // RPC returning a composite yields the row object (or null-ish with null id).
  const row = data as EscrowSchedule | null;
  return row && row.id ? row : null;
}

export async function getCashflowRange(
  id: string,
  start: string,
  months: number,
): Promise<MonthlyCashflow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("property_cashflow_range", {
    p_property_id: id,
    p_start: start,
    p_months: months,
  });
  if (error) throw error;
  return data ?? [];
}

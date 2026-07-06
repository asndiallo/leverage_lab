// =============================================================================
// Leverage Lab — Database types (hand-written to mirror the SQL schema exactly)
// -----------------------------------------------------------------------------
// Shaped like `supabase gen types typescript` output so it drops straight into
// createClient<Database>(). Once the project is scaffolded you can regenerate
// this file from the live schema; until then this is the source of truth.
//
// Conventions:
//   * `*_cents` fields are integer cents (bigint in PG) — represented as number.
//     JS numbers are safe up to 2^53 cents (~$90 trillion); fine for this domain.
//   * rates/percentages are numeric fractions (0.055 = 5.5%) — also number.
//   * Row = shape returned by select. Insert = shape accepted by insert
//     (columns with DB defaults are optional). Update = Partial<Insert>.
// =============================================================================

// ---- Enums (mirror the PG enum types in 0001) ------------------------------

export type PropertyType =
  | "single_family" | "duplex" | "triplex" | "fourplex"
  | "townhouse" | "condo" | "other";

export type PropertyStatus = "pending" | "active" | "sold";

export type LoanType = "original" | "refinance" | "heloc" | "second_lien" | "other";

export type RateType = "fixed" | "arm";

export type LoanStatus = "active" | "paid_off" | "refinanced_out";

export type JurisdictionType =
  | "isd" | "county" | "city" | "mud" | "esd" | "college" | "other";

export type ExemptionType =
  | "homestead" | "over65" | "disabled_veteran" | "disability" | "other";

export type ExemptionCalcMethod = "flat_amount" | "percent_of_assessed";

export type AssessedValueSource = "county_record" | "estimate";

export type LeaseStatus = "pending" | "active" | "ended";

export type VacancyReason =
  | "turnover" | "renovation" | "pcs_move" | "market_soft"
  | "intentional_hold" | "other";

export type TransactionDirection = "income" | "expense";

export type CategoryGroup =
  | "income" | "operating_expense" | "capital_improvement" | "loan" | "closing";

export type PaidBy = "owner" | "seller" | "tenant";

export type MarketSource = "zillow_estimate" | "appraisal" | "manual";

export type UtilityServiceType = "electric" | "water_sewer_trash" | "internet" | "gas";

export type DocumentType =
  | "receipt" | "lease" | "closing_disclosure" | "tax_document"
  | "insurance" | "statement" | "appraisal" | "other";

// Transaction category codes (seeded rows in transaction_categories).
// Kept as a string-literal union for compile-time safety even though the DB
// stores it as a text FK (so new categories can be added without a type migration).
export type TransactionCategoryCode =
  // income
  | "rent" | "late_fee" | "utility_reimbursement" | "other_income"
  // operating_expense
  | "utilities_electric" | "utilities_water" | "utilities_internet"
  | "insurance" | "hoa_dues" | "repairs_maintenance" | "supplies"
  | "property_management" | "other_operating"
  // capital_improvement
  | "renovation" | "appliance" | "security_system" | "landscaping" | "other_capital"
  // loan
  | "principal_payment" | "interest_payment" | "escrow_payment"
  // closing
  | "seller_credit" | "borrower_credit" | "closing_cost" | "prepaid"
  | "escrow_initial" | "other_closing";

// ---- Supabase-style Database interface -------------------------------------

type Timestamptz = string; // ISO string
type DateStr = string;     // 'YYYY-MM-DD'

export interface Database {
  public: {
    Tables: {
      properties: {
        Row: {
          id: string;
          user_id: string;
          address: string;
          city: string;
          state: string;
          zip: string;
          cad_account: string | null;
          parcel_id: string | null;
          purchase_price_cents: number;
          purchase_date: DateStr;
          property_type: PropertyType;
          status: PropertyStatus;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          address: string;
          city: string;
          state: string;
          zip: string;
          cad_account?: string | null;
          parcel_id?: string | null;
          purchase_price_cents: number;
          purchase_date: DateStr;
          property_type: PropertyType;
          status?: PropertyStatus;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
        };
        Update: Partial<Database["public"]["Tables"]["properties"]["Insert"]>;
      };

      loans: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          loan_type: LoanType;
          lender: string | null;
          original_amount_cents: number;
          interest_rate: number;
          rate_type: RateType;
          term_months: number;
          funding_date: DateStr | null;
          first_payment_date: DateStr | null;
          pi_override_cents: number | null;
          status: LoanStatus;
          replaces_loan_id: string | null;
          notes: string | null;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          loan_type?: LoanType;
          lender?: string | null;
          original_amount_cents: number;
          interest_rate: number;
          rate_type?: RateType;
          term_months: number;
          funding_date?: DateStr | null;
          first_payment_date?: DateStr | null;
          pi_override_cents?: number | null;
          status?: LoanStatus;
          replaces_loan_id?: string | null;
          notes?: string | null;
          created_at?: Timestamptz;
        };
        Update: Partial<Database["public"]["Tables"]["loans"]["Insert"]>;
      };

      escrow_schedules: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          loan_id: string | null;
          effective_date: DateStr;
          monthly_tax_escrow_cents: number;
          monthly_insurance_escrow_cents: number;
          monthly_hoa_cents: number;
          notes: string | null;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          loan_id?: string | null;
          effective_date: DateStr;
          monthly_tax_escrow_cents?: number;
          monthly_insurance_escrow_cents?: number;
          monthly_hoa_cents?: number;
          notes?: string | null;
          created_at?: Timestamptz;
        };
        Update: Partial<Database["public"]["Tables"]["escrow_schedules"]["Insert"]>;
      };

      property_settings: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          vacancy_reserve_rate: number;
          maintenance_reserve_rate: number;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          vacancy_reserve_rate?: number;
          maintenance_reserve_rate?: number;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
        };
        Update: Partial<Database["public"]["Tables"]["property_settings"]["Insert"]>;
      };

      taxing_jurisdictions: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          name: string;
          jurisdiction_type: JurisdictionType;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          name: string;
          jurisdiction_type: JurisdictionType;
          created_at?: Timestamptz;
        };
        Update: Partial<Database["public"]["Tables"]["taxing_jurisdictions"]["Insert"]>;
      };

      tax_rates: {
        Row: {
          id: string;
          user_id: string;
          jurisdiction_id: string;
          tax_year: number;
          rate: number;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          jurisdiction_id: string;
          tax_year: number;
          rate: number;
          created_at?: Timestamptz;
        };
        Update: Partial<Database["public"]["Tables"]["tax_rates"]["Insert"]>;
      };

      assessed_values: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          tax_year: number;
          land_value_cents: number;
          improvement_value_cents: number;
          total_assessed_cents: number;
          capped_assessed_cents: number | null;
          source: AssessedValueSource;
          recorded_at: Timestamptz;
          notes: string | null;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          tax_year: number;
          land_value_cents?: number;
          improvement_value_cents?: number;
          total_assessed_cents: number;
          capped_assessed_cents?: number | null;
          source: AssessedValueSource;
          recorded_at?: Timestamptz;
          notes?: string | null;
          created_at?: Timestamptz;
        };
        Update: Partial<Database["public"]["Tables"]["assessed_values"]["Insert"]>;
      };

      tax_exemptions: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          jurisdiction_id: string;
          exemption_type: ExemptionType;
          calc_method: ExemptionCalcMethod;
          flat_amount_cents: number | null;
          percent: number | null;
          min_amount_cents: number | null;
          max_amount_cents: number | null;
          effective_tax_year: number;
          applied: boolean;
          notes: string | null;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          jurisdiction_id: string;
          exemption_type: ExemptionType;
          calc_method: ExemptionCalcMethod;
          flat_amount_cents?: number | null;
          percent?: number | null;
          min_amount_cents?: number | null;
          max_amount_cents?: number | null;
          effective_tax_year: number;
          applied?: boolean;
          notes?: string | null;
          created_at?: Timestamptz;
        };
        Update: Partial<Database["public"]["Tables"]["tax_exemptions"]["Insert"]>;
      };

      leases: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          unit_identifier: string;
          tenant_name: string;
          tenant_email: string | null;
          rent_amount_cents: number;
          lease_start: DateStr;
          lease_end: DateStr | null;
          utilities_included: boolean;
          flat_utility_charge_cents: number;
          status: LeaseStatus;
          notes: string | null;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          unit_identifier: string;
          tenant_name: string;
          tenant_email?: string | null;
          rent_amount_cents: number;
          lease_start: DateStr;
          lease_end?: DateStr | null;
          utilities_included?: boolean;
          flat_utility_charge_cents?: number;
          status?: LeaseStatus;
          notes?: string | null;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
        };
        Update: Partial<Database["public"]["Tables"]["leases"]["Insert"]>;
      };

      vacancy_periods: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          unit_identifier: string | null;
          start_date: DateStr;
          end_date: DateStr | null;
          reason: VacancyReason;
          expected_rent_cents: number | null;
          expected_fill_date: DateStr | null;
          notes: string | null;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          unit_identifier?: string | null;
          start_date: DateStr;
          end_date?: DateStr | null;
          reason: VacancyReason;
          expected_rent_cents?: number | null;
          expected_fill_date?: DateStr | null;
          notes?: string | null;
          created_at?: Timestamptz;
        };
        Update: Partial<Database["public"]["Tables"]["vacancy_periods"]["Insert"]>;
      };

      transaction_categories: {
        Row: {
          code: TransactionCategoryCode;
          category_group: CategoryGroup;
          direction: TransactionDirection;
          label: string;
          sort_order: number;
        };
        Insert: {
          code: string;
          category_group: CategoryGroup;
          direction: TransactionDirection;
          label: string;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["transaction_categories"]["Insert"]>;
      };

      transactions: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          lease_id: string | null;
          loan_id: string | null;
          txn_date: DateStr;
          amount_cents: number;
          category: TransactionCategoryCode;
          description: string | null;
          paid_by: PaidBy;
          is_estimate: boolean;
          notes: string | null;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          lease_id?: string | null;
          loan_id?: string | null;
          txn_date: DateStr;
          amount_cents: number;
          category: TransactionCategoryCode;
          description?: string | null;
          paid_by?: PaidBy;
          is_estimate?: boolean;
          notes?: string | null;
          created_at?: Timestamptz;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Insert"]>;
      };

      market_snapshots: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          snapshot_date: DateStr;
          estimated_value_cents: number;
          source: MarketSource;
          notes: string | null;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          snapshot_date: DateStr;
          estimated_value_cents: number;
          source: MarketSource;
          notes?: string | null;
          created_at?: Timestamptz;
        };
        Update: Partial<Database["public"]["Tables"]["market_snapshots"]["Insert"]>;
      };

      utility_accounts: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          provider_name: string;
          account_number: string | null;
          service_type: UtilityServiceType;
          monthly_avg_cents: number | null;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          provider_name: string;
          account_number?: string | null;
          service_type: UtilityServiceType;
          monthly_avg_cents?: number | null;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
        };
        Update: Partial<Database["public"]["Tables"]["utility_accounts"]["Insert"]>;
      };

      documents: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          transaction_id: string | null;
          lease_id: string | null;
          storage_path: string;
          file_name: string;
          mime_type: string | null;
          size_bytes: number | null;
          doc_type: DocumentType;
          title: string | null;
          notes: string | null;
          uploaded_at: Timestamptz;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          transaction_id?: string | null;
          lease_id?: string | null;
          storage_path: string;
          file_name: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          doc_type?: DocumentType;
          title?: string | null;
          notes?: string | null;
          uploaded_at?: Timestamptz;
          created_at?: Timestamptz;
        };
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
      };
    };

    Views: {
      v_loan_payment: {
        Row: {
          loan_id: string;
          property_id: string;
          user_id: string;
          status: LoanStatus;
          monthly_pi_cents: number;
        };
      };
      v_property_yields: {
        Row: {
          property_id: string;
          user_id: string;
          purchase_price_cents: number;
          annual_rent_cents: number;
          total_cash_invested_cents: number;
          annual_net_cashflow_cents: number;
          gross_yield: number | null;
          net_yield: number | null;
          cash_on_cash: number | null;
        };
      };
    };

    Functions: {
      mortgage_monthly_pi: {
        Args: { p_principal_cents: number; p_annual_rate: number; p_term_months: number };
        Returns: number;
      };
      property_current_escrow: {
        Args: { p_property_id: string; p_asof?: DateStr };
        Returns: Database["public"]["Tables"]["escrow_schedules"]["Row"];
      };
      property_annual_tax_cents: {
        Args: { p_property_id: string; p_tax_year: number };
        Returns: number;
      };
      property_tax_basis_cents: {
        Args: { p_property_id: string };
        Returns: number;
      };
      property_monthly_cashflow: {
        Args: { p_property_id: string; p_month: DateStr };
        Returns: MonthlyCashflow[];
      };
      property_cashflow_range: {
        Args: { p_property_id: string; p_start: DateStr; p_months: number };
        Returns: MonthlyCashflow[];
      };
      property_tax_breakdown: {
        Args: { p_property_id: string; p_tax_year: number };
        Returns: TaxBreakdownRow[];
      };
    };
  };
}

// ---- Convenience aliases ---------------------------------------------------

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Property = Tables<"properties">;
export type Loan = Tables<"loans">;
export type EscrowSchedule = Tables<"escrow_schedules">;
export type PropertySettings = Tables<"property_settings">;
export type TaxingJurisdiction = Tables<"taxing_jurisdictions">;
export type TaxRate = Tables<"tax_rates">;
export type AssessedValue = Tables<"assessed_values">;
export type TaxExemption = Tables<"tax_exemptions">;
export type Lease = Tables<"leases">;
export type VacancyPeriod = Tables<"vacancy_periods">;
export type TransactionCategory = Tables<"transaction_categories">;
export type Transaction = Tables<"transactions">;
export type MarketSnapshot = Tables<"market_snapshots">;
export type UtilityAccount = Tables<"utility_accounts">;
export type DocumentRecord = Tables<"documents">;

export type LoanPayment = Database["public"]["Views"]["v_loan_payment"]["Row"];
export type PropertyYields = Database["public"]["Views"]["v_property_yields"]["Row"];

// Return shape of property_monthly_cashflow(). All *_cents are integer cents.
export interface MonthlyCashflow {
  month: DateStr;
  is_projected: boolean;
  is_vacant: boolean;
  gross_rent_cents: number;
  other_income_cents: number;
  income_total_cents: number;
  debt_service_cents: number;
  operating_expense_cents: number;
  vacancy_reserve_cents: number;
  maintenance_reserve_cents: number;
  net_cashflow_cents: number;
}

// Return shape of property_tax_breakdown() — one row per taxing jurisdiction.
export interface TaxBreakdownRow {
  jurisdiction_id: string;
  name: string;
  jurisdiction_type: JurisdictionType;
  rate: number;
  base_cents: number;
  exemption_cents: number;
  taxable_cents: number;
  tax_cents: number;
}

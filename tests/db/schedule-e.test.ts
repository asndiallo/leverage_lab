import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "../setup/supabase";
import {
  createTestProperty,
  createTestAssessedValue,
  createTestLoan,
  createTestLease,
  createTestPropertySettings,
  createTestEscrow,
  createTestUtilityAccount,
  createTestRentalUsePeriod,
  createTestTransaction,
  deleteTestProperty,
} from "../setup/fixtures";

describe("Schedule E engine", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("schedulee");
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  describe("depreciation_asset_year_cents (27.5yr, mid-month convention)", () => {
    async function dep(basis: number, placedInService: string, year: number) {
      const { data, error } = await user.client.rpc(
        "depreciation_asset_year_cents",
        {
          p_basis_cents: basis,
          p_placed_in_service: placedInService,
          p_tax_year: year,
        },
      );
      if (error) throw error;
      return data as number;
    }

    it("gives a full year 12/12 of basis/27.5 for a year fully inside the recovery period", async () => {
      // basis = $330,000 -> /27.5 = $12,000/yr = 1,200,000 cents exactly,
      // placed in service well before the test year so it's a full 12 months.
      expect(await dep(330_000_00, "2020-01-01", 2026)).toBe(1_200_000);
    });

    it("prorates the placed-in-service year by mid-month convention", async () => {
      // Placed in service July (month 7): first-year months = 12.5 - 7 = 5.5
      // fraction = 5.5/12 of the full-year amount.
      const fullYear = 1_200_000;
      const expected = Math.round((5.5 / 12) * fullYear);
      expect(await dep(330_000_00, "2026-07-01", 2026)).toBe(expected);
    });

    it("returns 0 for a year before the asset was placed in service", async () => {
      expect(await dep(330_000_00, "2027-01-01", 2026)).toBe(0);
    });

    it("returns 0 once the 27.5-year recovery period is fully exhausted", async () => {
      expect(await dep(330_000_00, "1990-01-01", 2026)).toBe(0);
    });

    it("returns 0 for a null basis or placed-in-service date", async () => {
      const { data, error } = await user.client.rpc(
        "depreciation_asset_year_cents",
        {
          p_basis_cents: null as unknown as number,
          p_placed_in_service: "2026-01-01",
          p_tax_year: 2026,
        },
      );
      if (error) throw error;
      expect(data).toBe(0);
    });
  });

  describe("property_building_basis_cents (land/building split off assessed value)", () => {
    let propertyId: string;

    beforeAll(async () => {
      const property = await createTestProperty(user.client, user.id, {
        purchase_price_cents: 29_550_000, // 117 Willow Cove's real purchase price
      });
      propertyId = property.id;
      // Real 2025 Guadalupe CAD split: land 3,711,800 / total 29,546,000.
      await createTestAssessedValue(user.client, user.id, propertyId, {
        tax_year: 2025,
        land_value_cents: 3_711_800,
        improvement_value_cents: 25_834_200,
        total_assessed_cents: 29_546_000,
        source: "county_record",
      });
    });

    afterAll(async () => {
      await deleteTestProperty(propertyId);
    });

    it("applies the land ratio to the purchase price, not the assessed value", async () => {
      const { data, error } = await user.client.rpc(
        "property_building_basis_cents",
        { p_property_id: propertyId },
      );
      if (error) throw error;
      // land ratio = 3,711,800 / 29,546,000 = 0.125610...
      // building basis = 29,550,000 * (1 - 0.125610...) = 25,838,939 (rounded)
      const landRatio = 3_711_800 / 29_546_000;
      const expected = Math.round(29_550_000 * (1 - landRatio));
      expect(data).toBe(expected);
    });

    it("returns null when no assessed value exists yet", async () => {
      const property = await createTestProperty(user.client, user.id, {
        purchase_price_cents: 20_000_000,
      });
      const { data, error } = await user.client.rpc(
        "property_building_basis_cents",
        { p_property_id: property.id },
      );
      if (error) throw error;
      expect(data).toBeNull();
      await deleteTestProperty(property.id);
    });
  });

  describe("property_rental_use_percent_for_year", () => {
    let propertyId: string;

    beforeAll(async () => {
      const property = await createTestProperty(user.client, user.id);
      propertyId = property.id;
    });

    afterAll(async () => {
      await deleteTestProperty(propertyId);
    });

    it("returns null when no rental_use_periods row exists for the year", async () => {
      const { data, error } = await user.client.rpc(
        "property_rental_use_percent_for_year",
        { p_property_id: propertyId, p_tax_year: 2099 },
      );
      if (error) throw error;
      expect(data).toBeNull();
    });

    it("time-weights a mid-year change (e.g. adding a roommate July 1st)", async () => {
      await createTestRentalUsePeriod(user.client, user.id, propertyId, {
        effective_date: "2026-01-01",
        rental_use_percent: 0.25,
      });
      await createTestRentalUsePeriod(user.client, user.id, propertyId, {
        effective_date: "2026-07-01",
        rental_use_percent: 0.5,
      });
      const { data, error } = await user.client.rpc(
        "property_rental_use_percent_for_year",
        { p_property_id: propertyId, p_tax_year: 2026 },
      );
      if (error) throw error;
      // Jan-Jun (6mo) @ 0.25 + Jul-Dec (6mo) @ 0.5 -> average 0.375.
      expect(data).toBeCloseTo(0.375, 6);
    });
  });

  describe("property_annual_interest_paid_cents", () => {
    it("prefers actual interest_payment transactions over the computed fallback", async () => {
      const property = await createTestProperty(user.client, user.id);
      await createTestLoan(user.client, user.id, property.id, {
        original_amount_cents: 30_185_300,
        interest_rate: 0.055,
        term_months: 360,
        funding_date: "2026-07-16",
        first_payment_date: "2026-09-01",
      });
      await createTestTransaction(user.client, user.id, property.id, {
        txn_date: "2026-09-01",
        amount_cents: 138_349,
        category: "interest_payment",
      });
      await createTestTransaction(user.client, user.id, property.id, {
        txn_date: "2026-10-01",
        amount_cents: 138_000,
        category: "interest_payment",
      });

      const { data, error } = await user.client.rpc(
        "property_annual_interest_paid_cents",
        { p_property_id: property.id, p_tax_year: 2026 },
      );
      if (error) throw error;
      expect(data).toBe(138_349 + 138_000);
      await deleteTestProperty(property.id);
    });

    it("falls back to computed amortization when no actuals are logged", async () => {
      const property = await createTestProperty(user.client, user.id);
      await createTestLoan(user.client, user.id, property.id, {
        original_amount_cents: 30_185_300,
        interest_rate: 0.055,
        term_months: 360,
        funding_date: "2026-07-16",
        first_payment_date: "2026-09-01",
        pi_override_cents: 171_389,
      });

      const { data, error } = await user.client.rpc(
        "property_annual_interest_paid_cents",
        { p_property_id: property.id, p_tax_year: 2026 },
      );
      if (error) throw error;
      // 4 payments made by end of 2026 (Sep, Oct, Nov, Dec) at $1,713.89 P&I;
      // interest = total P&I paid - principal paid down over the same window.
      expect(data).toBeGreaterThan(0);
      expect(data).toBeLessThan(171_389 * 4); // less than total P&I (some goes to principal)
      await deleteTestProperty(property.id);
    });
  });

  describe("property_schedule_e (full report)", () => {
    let propertyId: string;

    beforeAll(async () => {
      const property = await createTestProperty(user.client, user.id, {
        purchase_price_cents: 29_550_000,
      });
      propertyId = property.id;

      await createTestAssessedValue(user.client, user.id, propertyId, {
        tax_year: 2025,
        land_value_cents: 3_711_800,
        improvement_value_cents: 25_834_200,
        total_assessed_cents: 29_546_000,
        source: "county_record",
      });

      await createTestRentalUsePeriod(user.client, user.id, propertyId, {
        effective_date: "2026-01-01",
        rental_use_percent: 0.5, // half the house rented
      });

      await createTestLoan(user.client, user.id, propertyId, {
        original_amount_cents: 30_185_300,
        interest_rate: 0.055,
        term_months: 360,
        funding_date: "2026-07-16",
        first_payment_date: "2026-09-01",
      });

      // Rent received: 100% of it is rental income, never prorated.
      await createTestTransaction(user.client, user.id, propertyId, {
        txn_date: "2026-09-01",
        amount_cents: 120_000,
        category: "rent",
      });
      // Shared utility bill: prorated by rental-use %.
      await createTestTransaction(user.client, user.id, propertyId, {
        txn_date: "2026-09-05",
        amount_cents: 10_000,
        category: "utilities_electric",
      });
      // Management fee: NOT prorated (fully attributable to renting the rooms).
      await createTestTransaction(user.client, user.id, propertyId, {
        txn_date: "2026-09-10",
        amount_cents: 20_000,
        category: "property_management",
      });
      // Capital improvement: capitalized, not expensed directly.
      await createTestTransaction(user.client, user.id, propertyId, {
        txn_date: "2026-08-01",
        amount_cents: 500_000,
        category: "renovation",
      });
    });

    afterAll(async () => {
      await deleteTestProperty(propertyId);
    });

    it("reports full rent received, unprorated", async () => {
      const { data, error } = await user.client.rpc("property_schedule_e", {
        p_property_id: propertyId,
        p_tax_year: 2026,
      });
      if (error) throw error;
      const rent = data!.find((r) => r.line_code === "rents_received")!;
      expect(rent.amount_cents).toBe(120_000);
      expect(rent.is_prorated).toBe(false);
      expect(rent.source).toBe("actual");
    });

    it("prorates a shared operating expense by the rental-use %", async () => {
      const { data, error } = await user.client.rpc("property_schedule_e", {
        p_property_id: propertyId,
        p_tax_year: 2026,
      });
      if (error) throw error;
      const utilities = data!.find((r) => r.line_code === "utilities")!;
      expect(utilities.amount_cents).toBe(5_000); // 10,000 * 0.5
      expect(utilities.is_prorated).toBe(true);
    });

    it("does NOT prorate a category marked fully rental (management fees)", async () => {
      const { data, error } = await user.client.rpc("property_schedule_e", {
        p_property_id: propertyId,
        p_tax_year: 2026,
      });
      if (error) throw error;
      const mgmt = data!.find((r) => r.line_code === "management_fees")!;
      expect(mgmt.amount_cents).toBe(20_000);
      expect(mgmt.is_prorated).toBe(false);
    });

    it("includes computed mortgage-interest and taxes lines, prorated", async () => {
      const { data, error } = await user.client.rpc("property_schedule_e", {
        p_property_id: propertyId,
        p_tax_year: 2026,
      });
      if (error) throw error;
      const interest = data!.find((r) => r.line_code === "mortgage_interest")!;
      expect(interest.source).toBe("computed");
      expect(interest.is_prorated).toBe(true);
      expect(interest.amount_cents).toBeGreaterThan(0);

      const taxes = data!.find((r) => r.line_code === "taxes")!;
      expect(taxes.source).toBe("computed");
      // No tax_rates/jurisdictions configured in this test -> engine returns 0.
      expect(taxes.amount_cents).toBe(0);
    });

    it("flags mortgage-interest as 'actual' once an interest_payment transaction is logged, not always 'computed'", async () => {
      // Regression test: property_schedule_e's interest CTE used to hardcode
      // source: 'computed' whenever rental-use % was configured, even when
      // property_annual_interest_paid_cents() itself was using a real
      // transaction under the hood.
      await createTestTransaction(user.client, user.id, propertyId, {
        txn_date: "2026-09-01",
        amount_cents: 138_349,
        category: "interest_payment",
      });

      const { data, error } = await user.client.rpc("property_schedule_e", {
        p_property_id: propertyId,
        p_tax_year: 2026,
      });
      if (error) throw error;
      const interest = data!.find((r) => r.line_code === "mortgage_interest")!;
      expect(interest.source).toBe("actual");
      expect(interest.amount_cents).toBe(
        Math.round(138_349 * 0.5), // 50% rental-use in this fixture's beforeAll
      );
    });

    it("includes a positive, prorated depreciation line covering the building + the capital improvement", async () => {
      const { data, error } = await user.client.rpc("property_schedule_e", {
        p_property_id: propertyId,
        p_tax_year: 2026,
      });
      if (error) throw error;
      const dep = data!.find((r) => r.line_code === "depreciation")!;
      expect(dep.source).toBe("computed");
      expect(dep.amount_cents).toBeGreaterThan(0);
    });

    it("flags lines as not_configured (but still shows a face-value number) when rental-use % has never been set up", async () => {
      // A separate, genuinely unconfigured property — rental_use_periods rows
      // persist into future years once set (same versioning as escrow), so
      // this isn't reachable by just picking a later year on `propertyId`.
      const bare = await createTestProperty(user.client, user.id, {
        purchase_price_cents: 20_000_000,
      });
      await createTestTransaction(user.client, user.id, bare.id, {
        txn_date: "2026-03-01",
        amount_cents: 8_000,
        category: "insurance",
      });

      const { data, error } = await user.client.rpc("property_schedule_e", {
        p_property_id: bare.id,
        p_tax_year: 2026,
      });
      if (error) throw error;

      const insurance = data!.find((r) => r.line_code === "insurance")!;
      expect(insurance.source).toBe("not_configured");
      expect(insurance.amount_cents).toBe(8_000); // shown at face value, unprorated

      const dep = data!.find((r) => r.line_code === "depreciation")!;
      expect(dep.source).toBe("not_configured");
      expect(dep.amount_cents).toBe(0); // no assessed value either -> basis unknown

      await deleteTestProperty(bare.id);
    });
  });

  describe("auto-population from leases/escrow/utility accounts (no manual rental_use_periods)", () => {
    it("defaults to null (not configured) with no leases at all", async () => {
      const property = await createTestProperty(user.client, user.id);
      const { data: placed, error: e1 } = await user.client.rpc(
        "property_auto_placed_in_service",
        { p_property_id: property.id },
      );
      if (e1) throw e1;
      expect(placed).toBeNull();

      const { data: pct, error: e2 } = await user.client.rpc(
        "property_auto_rental_use_percent",
        { p_property_id: property.id },
      );
      if (e2) throw e2;
      expect(pct).toBeNull();
      await deleteTestProperty(property.id);
    });

    it("defaults to 100% (full rental) once any lease exists, with no total_rooms set", async () => {
      const property = await createTestProperty(user.client, user.id);
      await createTestLease(user.client, user.id, property.id, {
        unit_identifier: "whole_house",
        lease_start: "2026-03-01",
      });

      const { data: placed, error: e1 } = await user.client.rpc(
        "property_auto_placed_in_service",
        { p_property_id: property.id },
      );
      if (e1) throw e1;
      expect(placed).toBe("2026-03-01");

      const { data: pct, error: e2 } = await user.client.rpc(
        "property_auto_rental_use_percent",
        { p_property_id: property.id },
      );
      if (e2) throw e2;
      expect(pct).toBe(1);

      const { data: yearPct, error: e3 } = await user.client.rpc(
        "property_rental_use_percent_for_year",
        { p_property_id: property.id, p_tax_year: 2026 },
      );
      if (e3) throw e3;
      expect(yearPct).toBe(1);

      // Before the property was ever placed in service -> not configured.
      const { data: priorYearPct, error: e4 } = await user.client.rpc(
        "property_rental_use_percent_for_year",
        { p_property_id: property.id, p_tax_year: 2025 },
      );
      if (e4) throw e4;
      expect(priorYearPct).toBeNull();

      await deleteTestProperty(property.id);
    });

    it("computes a room-count fraction from distinct leased units / total_rooms", async () => {
      const property = await createTestProperty(user.client, user.id);
      await createTestPropertySettings(user.client, user.id, property.id, {
        total_rooms: 4,
      });
      await createTestLease(user.client, user.id, property.id, {
        unit_identifier: "room_1",
        lease_start: "2026-02-01",
      });
      await createTestLease(user.client, user.id, property.id, {
        unit_identifier: "room_2",
        lease_start: "2026-05-01",
      });

      const { data: pct, error } = await user.client.rpc(
        "property_auto_rental_use_percent",
        { p_property_id: property.id },
      );
      if (error) throw error;
      expect(pct).toBeCloseTo(0.5, 6); // 2 of 4 rooms

      await deleteTestProperty(property.id);
    });

    it("clamps the room-count fraction at 100% if leased units exceed total_rooms", async () => {
      const property = await createTestProperty(user.client, user.id);
      await createTestPropertySettings(user.client, user.id, property.id, {
        total_rooms: 1,
      });
      await createTestLease(user.client, user.id, property.id, {
        unit_identifier: "room_1",
      });
      await createTestLease(user.client, user.id, property.id, {
        unit_identifier: "room_2",
      });

      const { data: pct, error } = await user.client.rpc(
        "property_auto_rental_use_percent",
        { p_property_id: property.id },
      );
      if (error) throw error;
      expect(pct).toBe(1);
      await deleteTestProperty(property.id);
    });

    it("uses each lease's actual date range, not a lifetime max — a room stops counting once its lease ends", async () => {
      const property = await createTestProperty(user.client, user.id);
      await createTestPropertySettings(user.client, user.id, property.id, {
        total_rooms: 4,
      });
      // room_1: a fixed-term lease that ends. room_2: still active/open-ended.
      await createTestLease(user.client, user.id, property.id, {
        unit_identifier: "room_1",
        lease_start: "2026-01-01",
        lease_end: "2026-06-30",
        status: "ended",
      });
      await createTestLease(user.client, user.id, property.id, {
        unit_identifier: "room_2",
        lease_start: "2026-01-01",
      });

      const asOf = async (date: string) => {
        const { data, error } = await user.client.rpc(
          "property_auto_rental_use_percent",
          { p_property_id: property.id, p_asof: date },
        );
        if (error) throw error;
        return data;
      };

      // While room_1's lease is in effect: 2 of 4 rooms.
      expect(await asOf("2026-03-01")).toBeCloseTo(0.5, 6);
      // After room_1's lease ends and isn't renewed: only room_2 -> 1 of 4.
      expect(await asOf("2026-08-01")).toBeCloseTo(0.25, 6);
      // Before either lease started: not configured.
      expect(await asOf("2025-12-01")).toBeNull();

      await deleteTestProperty(property.id);
    });

    it("lets a manual rental_use_periods row override auto entirely, even with leases present", async () => {
      const property = await createTestProperty(user.client, user.id);
      await createTestPropertySettings(user.client, user.id, property.id, {
        total_rooms: 4,
      });
      await createTestLease(user.client, user.id, property.id, {
        unit_identifier: "room_1",
        lease_start: "2026-01-01",
      });
      await createTestRentalUsePeriod(user.client, user.id, property.id, {
        effective_date: "2026-01-01",
        rental_use_percent: 0.75, // deliberately different from the 1/4 auto value
      });

      const { data: current, error } = await user.client.rpc(
        "property_current_rental_use_percent",
        { p_property_id: property.id, p_asof: "2026-06-01" },
      );
      if (error) throw error;
      expect(current).toBe(0.75);
      await deleteTestProperty(property.id);
    });

    it("falls back to escrow's insurance/HOA and utility-account averages when no actual transactions are logged", async () => {
      const property = await createTestProperty(user.client, user.id);
      await createTestLease(user.client, user.id, property.id, {
        unit_identifier: "whole_house",
        lease_start: "2026-01-01",
      });
      await createTestEscrow(user.client, user.id, property.id, {
        effective_date: "2026-01-01",
        monthly_insurance_escrow_cents: 15_000,
        monthly_hoa_cents: 5_000,
      });
      await createTestUtilityAccount(user.client, user.id, property.id, {
        service_type: "electric",
        monthly_avg_cents: 10_000,
      });
      await createTestUtilityAccount(user.client, user.id, property.id, {
        service_type: "water_sewer_trash",
        monthly_avg_cents: 4_000,
      });

      const { data, error } = await user.client.rpc("property_schedule_e", {
        p_property_id: property.id,
        p_tax_year: 2026,
      });
      if (error) throw error;

      const insurance = data!.find((r) => r.line_code === "insurance")!;
      expect(insurance.source).toBe("computed");
      expect(insurance.amount_cents).toBe(15_000 * 12); // 100% rental, no actual txns

      const hoa = data!.find((r) => r.line_code === "hoa")!;
      expect(hoa.source).toBe("computed");
      expect(hoa.amount_cents).toBe(5_000 * 12);

      const utilities = data!.find((r) => r.line_code === "utilities")!;
      expect(utilities.source).toBe("computed");
      expect(utilities.amount_cents).toBe((10_000 + 4_000) * 12);

      await deleteTestProperty(property.id);
    });

    it("prefers actual transactions over the escrow/utility estimate when both exist", async () => {
      const property = await createTestProperty(user.client, user.id);
      await createTestLease(user.client, user.id, property.id, {
        unit_identifier: "whole_house",
        lease_start: "2026-01-01",
      });
      await createTestEscrow(user.client, user.id, property.id, {
        effective_date: "2026-01-01",
        monthly_insurance_escrow_cents: 15_000,
      });
      await createTestTransaction(user.client, user.id, property.id, {
        txn_date: "2026-04-01",
        amount_cents: 173_000,
        category: "insurance",
      });

      const { data, error } = await user.client.rpc("property_schedule_e", {
        p_property_id: property.id,
        p_tax_year: 2026,
      });
      if (error) throw error;
      const insurance = data!.find((r) => r.line_code === "insurance")!;
      expect(insurance.source).toBe("actual");
      expect(insurance.amount_cents).toBe(173_000); // not 15,000*12
      await deleteTestProperty(property.id);
    });

    it("depreciation unlocks from lease coverage alone, no manual rental_use_periods needed", async () => {
      const property = await createTestProperty(user.client, user.id, {
        purchase_price_cents: 29_550_000,
      });
      await createTestAssessedValue(user.client, user.id, property.id, {
        tax_year: 2025,
        land_value_cents: 3_711_800,
        improvement_value_cents: 25_834_200,
        total_assessed_cents: 29_546_000,
        source: "county_record",
      });
      await createTestLease(user.client, user.id, property.id, {
        unit_identifier: "whole_house",
        lease_start: "2026-01-01",
      });

      const { data, error } = await user.client.rpc(
        "property_annual_depreciation_cents",
        { p_property_id: property.id, p_tax_year: 2026 },
      );
      if (error) throw error;
      expect(data).toBeGreaterThan(0);
      await deleteTestProperty(property.id);
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "../setup/supabase";
import {
  createTestProperty,
  createTestJurisdiction,
  createTestTaxRate,
  createTestAssessedValue,
  createTestExemption,
  deleteTestProperty,
} from "../setup/fixtures";

// Texas multi-jurisdiction tax engine: property_annual_tax_cents,
// property_tax_breakdown, property_tax_with_homestead_cents. Each jurisdiction's
// exemption is clamp(flat + percent*base, min, max), summed per jurisdiction,
// then jurisdictions are summed for the total bill.
describe("tax engine", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("taxengine");
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  describe("multi-jurisdiction exemption shapes", () => {
    // Mirrors the real 117 Willow Cove certificate's documented shapes:
    //   ISD: flat-only homestead ($140k-equivalent)
    //   County: percent-of-assessed with a floor ("1%, min $5k")
    //   Lateral Roads: additive percent + flat ("1% + $3k")
    //   MUD: no exemption at all
    // Base (assessed) is $300,000 in every case for easy hand-verification.
    const BASE_CENTS = 30_000_000;
    let propertyId: string;
    let jIsd: string, jCounty: string, jRoads: string, jMud: string;

    beforeAll(async () => {
      const property = await createTestProperty(user.client, user.id, {
        purchase_price_cents: BASE_CENTS,
      });
      propertyId = property.id;

      await createTestAssessedValue(user.client, user.id, propertyId, {
        tax_year: 2026,
        total_assessed_cents: BASE_CENTS,
        source: "county_record",
      });

      const isd = await createTestJurisdiction(
        user.client,
        user.id,
        propertyId,
        {
          name: "Test ISD",
          jurisdiction_type: "isd",
        },
      );
      jIsd = isd.id;
      await createTestTaxRate(user.client, user.id, jIsd, {
        tax_year: 2026,
        rate: 0.0119,
      });
      await createTestExemption(user.client, user.id, propertyId, jIsd, {
        exemption_type: "homestead",
        calc_method: "flat_amount",
        flat_amount_cents: 14_000_000,
        percent: null,
        effective_tax_year: 2026,
        applied: true,
      });

      const county = await createTestJurisdiction(
        user.client,
        user.id,
        propertyId,
        {
          name: "Test County",
          jurisdiction_type: "county",
        },
      );
      jCounty = county.id;
      await createTestTaxRate(user.client, user.id, jCounty, {
        tax_year: 2026,
        rate: 0.005,
      });
      await createTestExemption(user.client, user.id, propertyId, jCounty, {
        exemption_type: "homestead",
        calc_method: "percent_of_assessed",
        flat_amount_cents: null,
        percent: 0.01,
        min_amount_cents: 500_000,
        effective_tax_year: 2026,
        applied: true,
      });

      const roads = await createTestJurisdiction(
        user.client,
        user.id,
        propertyId,
        {
          name: "Test Lateral Roads",
          jurisdiction_type: "other",
        },
      );
      jRoads = roads.id;
      await createTestTaxRate(user.client, user.id, jRoads, {
        tax_year: 2026,
        rate: 0.001,
      });
      await createTestExemption(user.client, user.id, propertyId, jRoads, {
        exemption_type: "other",
        calc_method: "percent_of_assessed",
        percent: 0.01,
        flat_amount_cents: 300_000,
        effective_tax_year: 2026,
        applied: true,
      });

      const mud = await createTestJurisdiction(
        user.client,
        user.id,
        propertyId,
        {
          name: "Test MUD",
          jurisdiction_type: "mud",
        },
      );
      jMud = mud.id;
      await createTestTaxRate(user.client, user.id, jMud, {
        tax_year: 2026,
        rate: 0.0002,
      });
      // no exemption for MUD

      // Excluded rows: unapplied and future-effective, must NOT reduce the MUD bill.
      await createTestExemption(user.client, user.id, propertyId, jMud, {
        exemption_type: "homestead",
        calc_method: "percent_of_assessed",
        percent: 0.5,
        effective_tax_year: 2026,
        applied: false,
      });
      await createTestExemption(user.client, user.id, propertyId, jMud, {
        exemption_type: "over65",
        calc_method: "flat_amount",
        flat_amount_cents: 10_000_000,
        effective_tax_year: 2030,
        applied: true,
      });
    });

    afterAll(async () => {
      await deleteTestProperty(propertyId);
    });

    it("computes the flat-exemption jurisdiction correctly (ISD)", async () => {
      const { data, error } = await user.client.rpc("property_tax_breakdown", {
        p_property_id: propertyId,
        p_tax_year: 2026,
      });
      if (error) throw error;
      const isdRow = data!.find((r) => r.jurisdiction_id === jIsd)!;
      expect(isdRow.exemption_cents).toBe(14_000_000);
      expect(isdRow.taxable_cents).toBe(BASE_CENTS - 14_000_000);
      expect(isdRow.tax_cents).toBe(190_400); // 16,000,000 * 0.0119
    });

    it("applies the percent-with-floor exemption correctly (County)", async () => {
      const { data, error } = await user.client.rpc("property_tax_breakdown", {
        p_property_id: propertyId,
        p_tax_year: 2026,
      });
      if (error) throw error;
      const countyRow = data!.find((r) => r.jurisdiction_id === jCounty)!;
      // 1% of 300,000 = 3,000, floored up to the 5,000 minimum.
      expect(countyRow.exemption_cents).toBe(500_000);
      expect(countyRow.taxable_cents).toBe(BASE_CENTS - 500_000);
      expect(countyRow.tax_cents).toBe(147_500); // 29,500,000 * 0.005
    });

    it("applies the additive percent+flat exemption correctly (Lateral Roads)", async () => {
      const { data, error } = await user.client.rpc("property_tax_breakdown", {
        p_property_id: propertyId,
        p_tax_year: 2026,
      });
      if (error) throw error;
      const roadsRow = data!.find((r) => r.jurisdiction_id === jRoads)!;
      // 1% of 300,000 ($3,000) + flat $3,000 = $6,000.
      expect(roadsRow.exemption_cents).toBe(600_000);
      expect(roadsRow.taxable_cents).toBe(BASE_CENTS - 600_000);
      expect(roadsRow.tax_cents).toBe(29_400); // 29,400,000 * 0.001
    });

    it("taxes a jurisdiction with no exemption at the full base, ignoring unapplied/future rows", async () => {
      const { data, error } = await user.client.rpc("property_tax_breakdown", {
        p_property_id: propertyId,
        p_tax_year: 2026,
      });
      if (error) throw error;
      const mudRow = data!.find((r) => r.jurisdiction_id === jMud)!;
      expect(mudRow.exemption_cents).toBe(0);
      expect(mudRow.tax_cents).toBe(6_000); // 30,000,000 * 0.0002
    });

    it("sums every jurisdiction into the annual total, matching the breakdown sum", async () => {
      const { data: annual, error: e1 } = await user.client.rpc(
        "property_annual_tax_cents",
        {
          p_property_id: propertyId,
          p_tax_year: 2026,
        },
      );
      if (e1) throw e1;
      expect(annual).toBe(190_400 + 147_500 + 29_400 + 6_000);

      const { data: breakdown, error: e2 } = await user.client.rpc(
        "property_tax_breakdown",
        {
          p_property_id: propertyId,
          p_tax_year: 2026,
        },
      );
      if (e2) throw e2;
      const breakdownTotal = breakdown!.reduce(
        (sum, r) => sum + r.tax_cents,
        0,
      );
      expect(breakdownTotal).toBe(annual);
    });
  });

  describe("property_tax_with_homestead_cents", () => {
    // Mirrors the real "seeded but not yet filed" scenario: a homestead
    // exemption that is applied=false and effective in a future year. The
    // function documents that it ignores BOTH filters to answer "what would
    // filing save?", unlike property_annual_tax_cents which respects them.
    let propertyId: string;

    beforeAll(async () => {
      const property = await createTestProperty(user.client, user.id, {
        purchase_price_cents: 30_000_000,
      });
      propertyId = property.id;
      await createTestAssessedValue(user.client, user.id, propertyId, {
        tax_year: 2026,
        total_assessed_cents: 30_000_000,
      });
      const j = await createTestJurisdiction(user.client, user.id, propertyId, {
        name: "Test ISD",
      });
      await createTestTaxRate(user.client, user.id, j.id, {
        tax_year: 2026,
        rate: 0.02,
      });
      await createTestExemption(user.client, user.id, propertyId, j.id, {
        exemption_type: "homestead",
        calc_method: "flat_amount",
        flat_amount_cents: 10_000_000,
        percent: null,
        effective_tax_year: 2030, // future
        applied: false, // not yet filed
      });
    });

    afterAll(async () => {
      await deleteTestProperty(propertyId);
    });

    it("does NOT apply the exemption in the real (current) tax total", async () => {
      const { data, error } = await user.client.rpc(
        "property_annual_tax_cents",
        {
          p_property_id: propertyId,
          p_tax_year: 2026,
        },
      );
      if (error) throw error;
      expect(data).toBe(600_000); // 30,000,000 * 0.02, no exemption
    });

    it("DOES apply the exemption in the hypothetical with-homestead total", async () => {
      const { data, error } = await user.client.rpc(
        "property_tax_with_homestead_cents",
        {
          p_property_id: propertyId,
          p_tax_year: 2026,
        },
      );
      if (error) throw error;
      expect(data).toBe(400_000); // (30,000,000 - 10,000,000) * 0.02
    });
  });

  describe("assessed value: capped vs total", () => {
    let propertyId: string;

    beforeAll(async () => {
      const property = await createTestProperty(user.client, user.id, {
        purchase_price_cents: 40_000_000,
      });
      propertyId = property.id;
      const j = await createTestJurisdiction(user.client, user.id, propertyId, {
        name: "Test ISD",
      });
      await createTestTaxRate(user.client, user.id, j.id, {
        tax_year: 2026,
        rate: 0.01,
      });
    });

    afterAll(async () => {
      await deleteTestProperty(propertyId);
    });

    it("prefers the homestead-capped value over the total appraised value when present", async () => {
      await createTestAssessedValue(user.client, user.id, propertyId, {
        tax_year: 2026,
        total_assessed_cents: 40_000_000,
        capped_assessed_cents: 33_000_000,
      });
      const { data, error } = await user.client.rpc(
        "property_annual_tax_cents",
        {
          p_property_id: propertyId,
          p_tax_year: 2026,
        },
      );
      if (error) throw error;
      expect(data).toBe(330_000); // 33,000,000 * 0.01, not 40,000,000
    });
  });
});

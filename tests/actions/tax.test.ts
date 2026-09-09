import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addTaxYear, addAssessedValue } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "../setup/supabase";
import {
  createTestProperty,
  createTestJurisdiction,
  createTestAssessedValue,
  deleteTestProperty,
} from "../setup/fixtures";
import { actAs, actAsSignedOut } from "../setup/actAs";
import { buildFormData } from "../setup/formData";

describe("addTaxYear", () => {
  let user: TestUser;
  let propertyId: string;
  let jIsd: string;
  let jCounty: string;

  beforeAll(async () => {
    user = await createTestUser("addtaxyear");
    const property = await createTestProperty(user.client, user.id);
    propertyId = property.id;
    const isd = await createTestJurisdiction(user.client, user.id, propertyId, {
      name: "Test ISD",
    });
    jIsd = isd.id;
    const county = await createTestJurisdiction(
      user.client,
      user.id,
      propertyId,
      { name: "Test County", jurisdiction_type: "county" },
    );
    jCounty = county.id;
  });

  afterAll(async () => {
    await deleteTestProperty(propertyId);
    await deleteTestUser(user.id);
  });

  it("rejects the call when not signed in", async () => {
    actAsSignedOut();
    const result = await addTaxYear(
      emptyActionState,
      buildFormData({ property_id: propertyId, tax_year: "2027" }),
    );
    expect(result.error).toBe("Not signed in");
  });

  it("rejects when no jurisdiction rate is entered", async () => {
    await actAs(user);
    const result = await addTaxYear(
      emptyActionState,
      buildFormData({ property_id: propertyId, tax_year: "2027" }),
    );
    expect(result.error).toBeTruthy();
  });

  it("converts $/$100 inputs to a per-dollar fraction and inserts one row per jurisdiction", async () => {
    await actAs(user);
    const result = await addTaxYear(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        tax_year: "2027",
        [`rate_${jIsd}`]: "1.076900",
        [`rate_${jCounty}`]: "0.278400",
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);

    const { data } = await user.client
      .from("tax_rates")
      .select("jurisdiction_id, rate")
      .eq("tax_year", 2027)
      .in("jurisdiction_id", [jIsd, jCounty]);
    const byJ = Object.fromEntries(
      data!.map((r) => [r.jurisdiction_id, r.rate]),
    );
    expect(byJ[jIsd]).toBeCloseTo(0.010769, 6);
    expect(byJ[jCounty]).toBeCloseTo(0.002784, 6);
  });

  it("leaving a jurisdiction blank skips it rather than writing a zero rate", async () => {
    await actAs(user);
    const result = await addTaxYear(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        tax_year: "2028",
        [`rate_${jIsd}`]: "1.0",
        [`rate_${jCounty}`]: "",
      }),
    );
    expect(result.ok).toBe(true);

    const { data } = await user.client
      .from("tax_rates")
      .select("jurisdiction_id")
      .eq("tax_year", 2028);
    expect(data!.map((r) => r.jurisdiction_id)).toEqual([jIsd]);
  });

  it("resubmitting the same jurisdiction/year corrects the rate instead of erroring", async () => {
    await actAs(user);
    await addTaxYear(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        tax_year: "2027",
        [`rate_${jIsd}`]: "2.0",
      }),
    );
    const { data } = await user.client
      .from("tax_rates")
      .select("rate")
      .eq("tax_year", 2027)
      .eq("jurisdiction_id", jIsd)
      .single();
    expect(data!.rate).toBeCloseTo(0.02, 6);
  });
});

describe("addAssessedValue", () => {
  let user: TestUser;
  let propertyId: string;

  beforeAll(async () => {
    user = await createTestUser("addassessed");
    const property = await createTestProperty(user.client, user.id);
    propertyId = property.id;
  });

  afterAll(async () => {
    await deleteTestProperty(propertyId);
    await deleteTestUser(user.id);
  });

  it("rejects the call when not signed in", async () => {
    actAsSignedOut();
    const result = await addAssessedValue(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        tax_year: "2027",
        land_value: "37118",
        improvement_value: "258342",
        total_assessed: "295460",
        source: "county_record",
      }),
    );
    expect(result.error).toBe("Not signed in");
  });

  it("rejects a negative value", async () => {
    await actAs(user);
    const result = await addAssessedValue(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        tax_year: "2027",
        land_value: "-1",
        improvement_value: "258342",
        total_assessed: "295460",
        source: "county_record",
      }),
    );
    expect(result.error).toBeTruthy();
  });

  it("inserts a new row with correct cents conversion", async () => {
    await actAs(user);
    const result = await addAssessedValue(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        tax_year: "2027",
        land_value: "37118",
        improvement_value: "258342",
        total_assessed: "295460",
        capped_assessed: "280000",
        source: "county_record",
        notes: "Certified 2027 value",
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);

    const { data } = await user.client
      .from("assessed_values")
      .select(
        "land_value_cents, improvement_value_cents, total_assessed_cents, capped_assessed_cents, notes",
      )
      .eq("property_id", propertyId)
      .eq("tax_year", 2027)
      .eq("source", "county_record")
      .single();
    expect(data!.land_value_cents).toBe(3_711_800);
    expect(data!.improvement_value_cents).toBe(25_834_200);
    expect(data!.total_assessed_cents).toBe(29_546_000);
    expect(data!.capped_assessed_cents).toBe(28_000_000);
    expect(data!.notes).toBe("Certified 2027 value");
  });

  it("resubmitting the same (property, year, source) corrects it instead of erroring", async () => {
    await actAs(user);
    const result = await addAssessedValue(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        tax_year: "2027",
        land_value: "40000",
        improvement_value: "260000",
        total_assessed: "300000",
        source: "county_record",
      }),
    );
    expect(result.ok).toBe(true);

    const { data } = await user.client
      .from("assessed_values")
      .select("total_assessed_cents")
      .eq("property_id", propertyId)
      .eq("tax_year", 2027)
      .eq("source", "county_record")
      .single();
    expect(data!.total_assessed_cents).toBe(30_000_000);
  });

  it("a different source for the same year is a separate row, not a correction", async () => {
    await actAs(user);
    await createTestAssessedValue(user.client, user.id, propertyId, {
      tax_year: 2029,
      total_assessed_cents: 20_000_000,
      source: "estimate",
    });
    const result = await addAssessedValue(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        tax_year: "2029",
        land_value: "40000",
        improvement_value: "260000",
        total_assessed: "300000",
        source: "county_record",
      }),
    );
    expect(result.ok).toBe(true);

    const { data } = await user.client
      .from("assessed_values")
      .select("source, total_assessed_cents")
      .eq("property_id", propertyId)
      .eq("tax_year", 2029);
    expect(data).toHaveLength(2);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { updatePropertySettings } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "../setup/supabase";
import {
  createTestProperty,
  createTestPropertySettings,
  deleteTestProperty,
} from "../setup/fixtures";
import { actAs, actAsSignedOut } from "../setup/actAs";
import { buildFormData } from "../setup/formData";

describe("updatePropertySettings", () => {
  let user: TestUser;
  let propertyId: string;

  beforeAll(async () => {
    user = await createTestUser("propsettings");
    const property = await createTestProperty(user.client, user.id);
    propertyId = property.id;
    await createTestPropertySettings(user.client, user.id, propertyId);
  });

  afterAll(async () => {
    await deleteTestProperty(propertyId);
    await deleteTestUser(user.id);
  });

  it("rejects the call when not signed in", async () => {
    actAsSignedOut();
    const result = await updatePropertySettings(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        vacancy_reserve_rate: "5",
        maintenance_reserve_rate: "1",
      }),
    );
    expect(result.error).toBe("Not signed in");
  });

  it("rejects a rate below 0", async () => {
    await actAs(user);
    const result = await updatePropertySettings(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        vacancy_reserve_rate: "-1",
        maintenance_reserve_rate: "1",
      }),
    );
    expect(result.error).toBeTruthy();
  });

  it("rejects a rate above 100", async () => {
    await actAs(user);
    const result = await updatePropertySettings(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        vacancy_reserve_rate: "5",
        maintenance_reserve_rate: "101",
      }),
    );
    expect(result.error).toBeTruthy();
  });

  it("saves the entered percentages as fractions on the existing settings row", async () => {
    await actAs(user);
    const result = await updatePropertySettings(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        vacancy_reserve_rate: "8",
        maintenance_reserve_rate: "1.5",
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);

    const { data } = await user.client
      .from("property_settings")
      .select("vacancy_reserve_rate, maintenance_reserve_rate")
      .eq("property_id", propertyId)
      .single();
    expect(data!.vacancy_reserve_rate).toBeCloseTo(0.08, 4);
    expect(data!.maintenance_reserve_rate).toBeCloseTo(0.015, 4);
  });
});

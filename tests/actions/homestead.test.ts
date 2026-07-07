import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setHomesteadFiled } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "../setup/supabase";
import {
  createTestProperty,
  createTestJurisdiction,
  createTestExemption,
  deleteTestProperty,
} from "../setup/fixtures";
import { actAs } from "../setup/actAs";
import { buildFormData } from "../setup/formData";

describe("setHomesteadFiled (Server Action)", () => {
  let user: TestUser;
  let propertyId: string;

  beforeAll(async () => {
    user = await createTestUser("homestead");
    const property = await createTestProperty(user.client, user.id);
    propertyId = property.id;
    const j1 = await createTestJurisdiction(user.client, user.id, propertyId, {
      name: "Test ISD",
    });
    const j2 = await createTestJurisdiction(user.client, user.id, propertyId, {
      name: "Test County",
    });
    await createTestExemption(user.client, user.id, propertyId, j1.id, {
      exemption_type: "homestead",
      applied: false,
    });
    await createTestExemption(user.client, user.id, propertyId, j2.id, {
      exemption_type: "homestead",
      applied: false,
    });
    // A non-homestead exemption must be left untouched by the toggle.
    await createTestExemption(user.client, user.id, propertyId, j2.id, {
      exemption_type: "over65",
      applied: false,
    });
  });

  afterAll(async () => {
    await deleteTestProperty(propertyId);
    await deleteTestUser(user.id);
  });

  it("marks every homestead exemption on the property as applied", async () => {
    await actAs(user);
    const result = await setHomesteadFiled(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        filed: "true",
      }),
    );
    expect(result.error).toBeUndefined();

    const { data } = await user.client
      .from("tax_exemptions")
      .select("exemption_type, applied")
      .eq("property_id", propertyId);
    const homestead = data!.filter((r) => r.exemption_type === "homestead");
    const other = data!.filter((r) => r.exemption_type === "over65");
    expect(homestead.every((r) => r.applied)).toBe(true);
    expect(other[0].applied).toBe(false); // untouched
  });

  it("can toggle back to not-filed", async () => {
    await actAs(user);
    const result = await setHomesteadFiled(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        filed: "false",
      }),
    );
    expect(result.error).toBeUndefined();

    const { data } = await user.client
      .from("tax_exemptions")
      .select("applied")
      .eq("property_id", propertyId)
      .eq("exemption_type", "homestead");
    expect(data!.every((r) => !r.applied)).toBe(true);
  });
});

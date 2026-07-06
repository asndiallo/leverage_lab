import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inviteCoOwner, revokeInvite } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import { createTestUser, deleteTestUser, type TestUser } from "../setup/supabase";
import { createTestProperty, deleteTestProperty } from "../setup/fixtures";
import { actAs, actAsSignedOut } from "../setup/actAs";
import { setRequestHeaders } from "../setup/mockNext";
import { buildFormData } from "../setup/formData";

describe("inviteCoOwner / revokeInvite (Server Actions)", () => {
  let user: TestUser;
  let propertyId: string;

  beforeAll(async () => {
    user = await createTestUser("coowner");
    const property = await createTestProperty(user.client, user.id);
    propertyId = property.id;
    setRequestHeaders({ host: "leverage-lab.test", "x-forwarded-proto": "https" });
  });

  afterAll(async () => {
    await deleteTestProperty(propertyId);
    await deleteTestUser(user.id);
  });

  it("rejects the call when not signed in", async () => {
    actAsSignedOut();
    const result = await inviteCoOwner(emptyActionState, buildFormData({
      property_id: propertyId, email: "spouse@example.test",
    }));
    expect(result.error).toBe("Not signed in");
  });

  it("rejects an invalid email", async () => {
    await actAs(user);
    const result = await inviteCoOwner(emptyActionState, buildFormData({
      property_id: propertyId, email: "not-an-email",
    }));
    expect(result.error).toMatch(/valid email/i);
  });

  it("creates an invite and returns a shareable link built from the request host", async () => {
    await actAs(user);
    const result = await inviteCoOwner(emptyActionState, buildFormData({
      property_id: propertyId, email: "Spouse@Example.test",
    }));
    expect(result.error).toBeUndefined();
    expect(result.inviteUrl).toBeDefined();

    const { data } = await user.client
      .from("property_invites")
      .select("*")
      .eq("property_id", propertyId)
      .single();
    expect(data!.email).toBe("spouse@example.test"); // lowercased
    expect(data!.status).toBe("pending");
    expect(result.inviteUrl).toBe(`https://leverage-lab.test/invites/${data!.token}`);
  });

  it("revokes a pending invite", async () => {
    await actAs(user);
    await inviteCoOwner(emptyActionState, buildFormData({
      property_id: propertyId, email: "revoke-me@example.test",
    }));
    const { data: invite } = await user.client
      .from("property_invites")
      .select("id")
      .eq("email", "revoke-me@example.test")
      .single();

    const result = await revokeInvite(emptyActionState, buildFormData({
      invite_id: invite!.id, property_id: propertyId,
    }));
    expect(result.error).toBeUndefined();

    const { data: after } = await user.client
      .from("property_invites")
      .select("status")
      .eq("id", invite!.id)
      .single();
    expect(after!.status).toBe("revoked");
  });
});

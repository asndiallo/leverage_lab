import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "../setup/supabase";
import {
  createTestProperty,
  createTestTransaction,
  createTestJurisdiction,
  createTestTaxRate,
  deleteTestProperty,
} from "../setup/fixtures";

describe("multi-owner RLS and invite flow", () => {
  let owner: TestUser;
  let stranger: TestUser; // never invited to anything
  const cleanupPropertyIds: string[] = [];

  beforeAll(async () => {
    owner = await createTestUser("owner");
    stranger = await createTestUser("stranger");
  });

  afterAll(async () => {
    await deleteTestUser(owner.id);
    await deleteTestUser(stranger.id);
  });

  afterEach(async () => {
    while (cleanupPropertyIds.length) await deleteTestProperty(cleanupPropertyIds.pop()!);
  });

  async function ownedProperty() {
    const property = await createTestProperty(owner.client, owner.id);
    cleanupPropertyIds.push(property.id);
    return property;
  }

  it("hides a property (and its child rows) entirely from a non-member", async () => {
    const property = await ownedProperty();
    await createTestTransaction(owner.client, owner.id, property.id, { category: "rent", amount_cents: 1000 });

    const { data: props } = await stranger.client.from("properties").select("id").eq("id", property.id);
    expect(props).toEqual([]);

    const { data: txns } = await stranger.client.from("transactions").select("id").eq("property_id", property.id);
    expect(txns).toEqual([]);
  });

  it("hides tax_rates from a non-member of the jurisdiction's property", async () => {
    const property = await ownedProperty();
    const jurisdiction = await createTestJurisdiction(owner.client, owner.id, property.id);
    await createTestTaxRate(owner.client, owner.id, jurisdiction.id);

    const { data: ratesAsOwner } = await owner.client
      .from("tax_rates")
      .select("id")
      .eq("jurisdiction_id", jurisdiction.id);
    expect(ratesAsOwner).toHaveLength(1);

    const { data: ratesAsStranger } = await stranger.client
      .from("tax_rates")
      .select("id")
      .eq("jurisdiction_id", jurisdiction.id);
    expect(ratesAsStranger).toEqual([]);
  });

  it("denies a direct client insert into property_members (only the trigger/RPC may write it)", async () => {
    const property = await ownedProperty();
    const { error } = await owner.client
      .from("property_members")
      .insert({ property_id: property.id, user_id: stranger.id, invited_by: owner.id });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("does not leak property_members rows to non-members via property_members_with_email", async () => {
    const property = await ownedProperty();
    const { data } = await stranger.client.rpc("property_members_with_email", {
      p_property_id: property.id,
    });
    expect(data).toEqual([]);
  });

  describe("accept_property_invite", () => {
    it("grants full membership once accepted, matching by email", async () => {
      const property = await ownedProperty();
      const invitee = await createTestUser("invitee");
      try {
        const { data: invite, error: inviteErr } = await owner.client
          .from("property_invites")
          .insert({ property_id: property.id, email: invitee.email, invited_by: owner.id })
          .select("token")
          .single();
        if (inviteErr) throw inviteErr;

        const { data: before } = await invitee.client.from("properties").select("id").eq("id", property.id);
        expect(before).toEqual([]);

        const { data: acceptedPropertyId, error: acceptErr } = await invitee.client.rpc(
          "accept_property_invite",
          { p_token: invite!.token },
        );
        expect(acceptErr).toBeNull();
        expect(acceptedPropertyId).toBe(property.id);

        const { data: after } = await invitee.client.from("properties").select("id").eq("id", property.id);
        expect(after).toHaveLength(1);

        const { data: members } = await invitee.client.rpc("property_members_with_email", {
          p_property_id: property.id,
        });
        expect(members!.map((m) => m.email).sort()).toEqual([invitee.email, owner.email].sort());
      } finally {
        await deleteTestUser(invitee.id);
      }
    });

    it("rejects acceptance by a signed-in user whose email doesn't match the invite", async () => {
      const property = await ownedProperty();
      const { data: invite, error } = await owner.client
        .from("property_invites")
        .insert({ property_id: property.id, email: "someone-else@example.test", invited_by: owner.id })
        .select("token")
        .single();
      if (error) throw error;

      const { error: acceptErr } = await stranger.client.rpc("accept_property_invite", {
        p_token: invite!.token,
      });
      expect(acceptErr).not.toBeNull();
      expect(acceptErr!.message).toMatch(/different email/i);

      const { data: props } = await stranger.client.from("properties").select("id").eq("id", property.id);
      expect(props).toEqual([]);
    });

    it("rejects an expired invite", async () => {
      const property = await ownedProperty();
      const invitee = await createTestUser("expiredinvite");
      try {
        // Backdate expires_at directly — the app never does this, but it's
        // the only way to deterministically produce an expired invite.
        const { data: invite, error } = await adminClient
          .from("property_invites")
          .insert({
            property_id: property.id,
            email: invitee.email,
            invited_by: owner.id,
            expires_at: new Date(Date.now() - 1000).toISOString(),
          })
          .select("token")
          .single();
        if (error) throw error;

        const { error: acceptErr } = await invitee.client.rpc("accept_property_invite", {
          p_token: invite!.token,
        });
        expect(acceptErr).not.toBeNull();
        expect(acceptErr!.message).toMatch(/invalid, expired, or already used/i);
      } finally {
        await deleteTestUser(invitee.id);
      }
    });

    it("rejects re-accepting an already-accepted invite", async () => {
      const property = await ownedProperty();
      const invitee = await createTestUser("reaccept");
      try {
        const { data: invite, error } = await owner.client
          .from("property_invites")
          .insert({ property_id: property.id, email: invitee.email, invited_by: owner.id })
          .select("token")
          .single();
        if (error) throw error;

        const first = await invitee.client.rpc("accept_property_invite", { p_token: invite!.token });
        expect(first.error).toBeNull();

        const second = await invitee.client.rpc("accept_property_invite", { p_token: invite!.token });
        expect(second.error).not.toBeNull();
      } finally {
        await deleteTestUser(invitee.id);
      }
    });

    it("rejects an invite that was revoked before acceptance", async () => {
      const property = await ownedProperty();
      const invitee = await createTestUser("revoked");
      try {
        const { data: invite, error } = await owner.client
          .from("property_invites")
          .insert({ property_id: property.id, email: invitee.email, invited_by: owner.id })
          .select("id, token")
          .single();
        if (error) throw error;

        const { error: revokeErr } = await owner.client
          .from("property_invites")
          .update({ status: "revoked" })
          .eq("id", invite!.id);
        expect(revokeErr).toBeNull();

        const { error: acceptErr } = await invitee.client.rpc("accept_property_invite", {
          p_token: invite!.token,
        });
        expect(acceptErr).not.toBeNull();
      } finally {
        await deleteTestUser(invitee.id);
      }
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "../setup/supabase";

// mortgage_monthly_pi is a pure SQL function (no table access) but still
// requires an authenticated role per its grant, so we still need a signed-in
// user to call it.
describe("mortgage_monthly_pi", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("mortgage");
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  async function pi(principalCents: number, annualRate: number, termMonths: number) {
    const { data, error } = await user.client.rpc("mortgage_monthly_pi", {
      p_principal_cents: principalCents,
      p_annual_rate: annualRate,
      p_term_months: termMonths,
    });
    if (error) throw error;
    return data as number;
  }

  it("matches the real lender-validated figure for $301,853 @ 5.5%/30yr", async () => {
    // Cross-checked against 117 Willow Cove's actual NFCU closing disclosure.
    expect(await pi(30_185_300, 0.055, 360)).toBe(171389);
  });

  it("computes standard fully-amortizing payments", async () => {
    expect(await pi(30_000_000, 0.055, 360)).toBe(170337);
  });

  it("falls back to straight-line amortization when the rate is zero", async () => {
    expect(await pi(1_200_000, 0, 12)).toBe(100_000);
  });

  it("returns 0 for a non-positive term", async () => {
    expect(await pi(30_000_000, 0.055, 0)).toBe(0);
  });

  it("scales linearly with principal at a fixed rate/term", async () => {
    const small = await pi(10_000_000, 0.06, 360);
    const double = await pi(20_000_000, 0.06, 360);
    expect(double).toBe(small * 2);
  });
});

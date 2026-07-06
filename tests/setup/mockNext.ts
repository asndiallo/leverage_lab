import { vi } from "vitest";

// Server Actions (lib/actions.ts) call cookies()/headers() from "next/headers"
// and revalidatePath() from "next/cache" — all of which throw outside a real
// Next.js request lifecycle. Registered globally via vitest.config.ts
// setupFiles, before any test file imports lib/actions.ts, so every action
// under test runs against this fake request context instead of a real one.
type CookieEntry = { name: string; value: string };

const state: { cookie: CookieEntry | null; headers: Record<string, string> } = {
  cookie: null,
  headers: { host: "localhost:3000", "x-forwarded-proto": "http" },
};

vi.mock("next/headers", () => ({
  cookies: () => ({
    getAll: () => (state.cookie ? [state.cookie] : []),
    get: (name: string) => (state.cookie?.name === name ? state.cookie : undefined),
    set: () => {},
  }),
  headers: () => ({
    get: (name: string) => state.headers[name.toLowerCase()] ?? null,
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

/** Set (or clear, with null) which session cookie the mocked request "carries". */
export function setSessionCookie(cookie: CookieEntry | null) {
  state.cookie = cookie;
}

export function setRequestHeaders(headers: Record<string, string>) {
  state.headers = { ...state.headers, ...headers };
}

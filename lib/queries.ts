// Barrel re-export so existing `import { x } from "@/lib/queries"` call
// sites don't need to change — the queries themselves live in lib/queries/*,
// split by domain.
export * from "./queries/properties";
export * from "./queries/tax";
export * from "./queries/transactions";
export * from "./queries/co-ownership";
export * from "./queries/documents";
export * from "./queries/leases";

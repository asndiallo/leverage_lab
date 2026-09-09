// Barrel re-export so existing `import { x } from "@/lib/actions"` call
// sites don't need to change — the actions themselves live in lib/actions/*,
// split by domain (each file needs its own "use server" directive, so they
// can't just live inline here).
export * from "./actions/properties";
export * from "./actions/leases";
export * from "./actions/transactions";
export * from "./actions/homestead";
export * from "./actions/tax";
export * from "./actions/documents";
export * from "./actions/co-ownership";
export * from "./actions/market-snapshots";
export * from "./actions/rental-use";

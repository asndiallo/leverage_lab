import { config } from "dotenv";
import path from "node:path";

// Tests run outside Next.js, which normally loads .env.local itself — do it
// here so NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/SUPABASE_SERVICE_ROLE_KEY exist.
config({ path: path.resolve(__dirname, "../../.env.local") });

// Merchant backfill by hand (logos and places); the bank sync does the same for new merchants after each run.
//   deno run -A scripts/merchants.ts            needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
//   deno run -A scripts/merchants.ts upgrade    also swaps favicons for App Store icons and retries sites without one
import { createClient } from "npm:@supabase/supabase-js@2";
import { fillLogos, upgradeLogos } from "../supabase/functions/_shared/logos.ts";
import { fillPlaces } from "../supabase/functions/_shared/places.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const { data, error } = await db.from("transactions").select("user_id").neq("status", "void");
if (error) throw new Error(error.message);
for (const userId of new Set((data ?? []).map((r) => r.user_id as string))) {
  console.log(userId, "logos", await fillLogos(db, userId, 500), "places", await fillPlaces(db, userId, 1000));
}
if (Deno.args[0] === "upgrade") console.log("upgrade", await upgradeLogos(db));

// Logo backfill by hand; the bank sync does the same for new merchants after each run.
//   deno run -A scripts/logos.ts      needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
import { createClient } from "npm:@supabase/supabase-js@2";
import { fillLogos } from "../supabase/functions/_shared/logos.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const { data, error } = await db.from("transactions").select("user_id").neq("status", "void");
if (error) throw new Error(error.message);
for (const userId of new Set((data ?? []).map((r) => r.user_id as string))) console.log(userId, await fillLogos(db, userId, 500));

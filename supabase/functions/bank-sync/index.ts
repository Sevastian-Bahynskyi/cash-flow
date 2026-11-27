import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/sync/http.ts";
import { createEbClient, type PsuHeaders } from "../_shared/enable-banking.ts";
import { fillLogos } from "../_shared/logos.ts";
import { classifyLabeler } from "../_shared/sync/label.ts";
import { type SyncRun, syncUser } from "../_shared/sync/run.ts";

// Two callers: pg_cron (x-cron-secret, all users) and the signed-in app (user JWT, that user, once per 15 min).
const USER_THROTTLE_MS = 15 * 60 * 1000;

/** Logos for new merchants after the response is sent; a failure only means no logo yet. */
const logosLater = (db: Parameters<typeof fillLogos>[0], userId: string): void => {
  EdgeRuntime.waitUntil(fillLogos(db, userId).catch((e) => console.error("bank-sync: logos failed", e instanceof Error ? e.message : String(e))));
};

const constantTimeEqual = (a: string, b: string): boolean => {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return preflight();
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appId = Deno.env.get("EB_APP_ID");
  const privateKey = Deno.env.get("EB_PRIVATE_KEY");
  if (!supabaseUrl || !serviceKey || !appId || !privateKey) {
    console.error("bank-sync: missing configuration");
    return json({ error: "Not configured" }, 500);
  }
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret !== null) {
    const expected = Deno.env.get("CRON_SECRET");
    if (!expected || !constantTimeEqual(cronSecret, expected)) {
      return json({ error: "Unauthorized" }, 401);
    }
    const { data: connections, error } = await db
      .from("bank_connections")
      .select("user_id")
      .overrideTypes<{ user_id: string }[], { merge: false }>();
    if (error) {
      console.error("bank-sync: connections select failed", error.message);
      return json({ error: "Sync failed" }, 500);
    }
    const eb = await createEbClient(appId, privateKey);
    const runs: SyncRun[] = [];
    for (const userId of new Set((connections ?? []).map((c) => c.user_id))) {
      try {
        const { throttled: _busy, ...run } = await syncUser(db, eb, classifyLabeler, userId, "cron", null);
        runs.push(run);
        logosLater(db, userId);
      } catch (syncError) {
        console.error("bank-sync: run failed", syncError instanceof Error ? syncError.message : String(syncError));
      }
    }
    return json({ runs });
  }

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth, error: authError } = token ? await db.auth.getUser(token) : { data: null, error: null };
  const userId = auth?.user?.id;
  if (authError || !userId) {
    return json({ error: "Unauthorized" }, 401);
  }

  const psu: PsuHeaders = {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0",
    userAgent: req.headers.get("user-agent") ?? "Cashflow",
  };
  try {
    const eb = await createEbClient(appId, privateKey);
    const { throttled, ...run } = await syncUser(db, eb, classifyLabeler, userId, "user", psu, USER_THROTTLE_MS);
    if (!throttled) logosLater(db, userId);
    return json({ run, throttled });
  } catch (syncError) {
    console.error("bank-sync: run failed", syncError instanceof Error ? syncError.message : String(syncError));
    return json({ error: "Sync failed" }, 500);
  }
});

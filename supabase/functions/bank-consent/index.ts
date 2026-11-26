import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/sync/http.ts";
import { createEbConsentClient } from "../_shared/enable-banking.ts";
import { upsertBankAccount } from "../_shared/sync/run.ts";

// Consent renewal from the app's "Renew" banner. User JWT only.
//   POST { connection_id }  -> { url }                         (open url: bank consent page)
//   POST { code, state }    -> { connection_id, accounts }     (web /bank/callback posts these)
const STATE_TTL_MS = 30 * 60 * 1000;
const FALLBACK_CONSENT_SECONDS = 180 * 86_400;

type Body = { connection_id?: unknown; code?: unknown; state?: unknown };

const randomToken = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");

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
  const appUrl = Deno.env.get("PUBLIC_APP_URL");
  if (!supabaseUrl || !serviceKey || !appId || !privateKey || !appUrl) {
    console.error("bank-consent: missing configuration");
    return json({ error: "Not configured" }, 500);
  }
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth, error: authError } = token ? await db.auth.getUser(token) : { data: null, error: null };
  const userId = auth?.user?.id;
  if (authError || !userId) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  try {
    const eb = await createEbConsentClient(appId, privateKey);

    if (typeof body.connection_id === "string") {
      const { data: connection, error } = await db
        .from("bank_connections")
        .select("id, aspsp_name, aspsp_country")
        .eq("user_id", userId)
        .eq("id", body.connection_id)
        .maybeSingle()
        .overrideTypes<{ id: string; aspsp_name: string; aspsp_country: string }, { merge: false }>();
      if (error) throw new Error(`bank_connections select: ${error.message}`);
      if (!connection) return json({ error: "Connection not found" }, 404);

      const aspsp = { name: connection.aspsp_name, country: connection.aspsp_country };
      const seconds = (await eb.maxConsentSeconds(aspsp)) ?? FALLBACK_CONSENT_SECONDS;
      // A minute of slack so the bank never sees a validity past its maximum.
      const validUntil = new Date(Date.now() + (seconds - 60) * 1000).toISOString();
      const state = randomToken();
      const { error: stateError } = await db
        .from("bank_consent_states")
        .insert({ state, user_id: userId, connection_id: connection.id });
      if (stateError) throw new Error(`bank_consent_states insert: ${stateError.message}`);

      const { url } = await eb.startAuth({ aspsp, validUntil, redirectUrl: `${appUrl}/bank/callback`, state });
      return json({ url });
    }

    if (typeof body.code === "string" && typeof body.state === "string") {
      // One-time token, consumed atomically: of two parallel callbacks only one gets the row back.
      const { data: consumed, error } = await db
        .from("bank_consent_states")
        .delete()
        .eq("user_id", userId)
        .eq("state", body.state)
        .gt("created_at", new Date(Date.now() - STATE_TTL_MS).toISOString())
        .select("connection_id")
        .overrideTypes<{ connection_id: string }[], { merge: false }>();
      if (error) throw new Error(`bank_consent_states consume: ${error.message}`);
      const pending = consumed?.length === 1 ? consumed[0] : undefined;
      if (!pending) {
        return json({ error: "Consent link expired, start again" }, 400);
      }

      const session = await eb.createSession(body.code);
      const { error: connectionError } = await db
        .from("bank_connections")
        .update({
          session_id: session.session_id,
          aspsp_name: session.aspsp.name,
          aspsp_country: session.aspsp.country,
          valid_until: session.access.valid_until,
          status: "AUTHORIZED",
        })
        .eq("user_id", userId)
        .eq("id", pending.connection_id);
      if (connectionError) throw new Error(`bank_connections update: ${connectionError.message}`);

      for (const account of session.accounts) {
        await upsertBankAccount(db, userId, pending.connection_id, account);
      }
      return json({ connection_id: pending.connection_id, accounts: session.accounts.length });
    }

    return json({ error: "Expected {connection_id} or {code, state}" }, 400);
  } catch (consentError) {
    console.error("bank-consent: failed", consentError instanceof Error ? consentError.message : String(consentError));
    return json({ error: "Consent failed" }, 502);
  }
});

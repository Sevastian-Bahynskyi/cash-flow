// bank-consent end to end, in-process, against the LOCAL stack. Enable Banking is a stub (no network).
// Run: deno test -A --node-modules-dir=none supabase/functions/bank-consent/index_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient } from "npm:@supabase/supabase-js@2";

const out = await new Deno.Command("supabase", { args: ["status", "-o", "json"], stdout: "piped", stderr: "null" }).output();
const status = JSON.parse(new TextDecoder().decode(out.stdout)) as { API_URL: string; SERVICE_ROLE_KEY: string; ANON_KEY: string };
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(status.API_URL)) throw new Error("refusing: not a local Supabase URL");

const APP_URL = "https://app.example.invalid";
const pair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);
const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
Deno.env.set("SUPABASE_URL", status.API_URL);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", status.SERVICE_ROLE_KEY);
Deno.env.set("EB_APP_ID", "00000000-fake-4000-8000-000000000000");
Deno.env.set("EB_PRIVATE_KEY", `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`);
Deno.env.set("PUBLIC_APP_URL", APP_URL);

// Enable Banking stub. The next POST /sessions answer is set per test.
type NewSession = {
  session_id: string;
  accounts: { uid: string; identification_hash: string; name: string; currency: string; cash_account_type: string }[];
  aspsp: { name: string; country: string };
  access: { valid_until: string };
};
const eb = { calls: [] as { method: string; path: string; body: unknown }[], session: null as NewSession | null };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== "api.enablebanking.com") return realFetch(input, init);
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  eb.calls.push({ method: init?.method ?? "GET", path: url.pathname, body });
  if (url.pathname === "/aspsps") return new Response(JSON.stringify({ aspsps: [{ name: "Fakebank", country: "DK", maximum_consent_validity: 15552000 }] }));
  if (url.pathname === "/auth") return new Response(JSON.stringify({ url: "https://bank.example.invalid/consent" }));
  if (url.pathname === "/sessions" && eb.session) return new Response(JSON.stringify(eb.session));
  return new Response("not stubbed", { status: 400 });
};

let handler: ((req: Request) => Response | Promise<Response>) | null = null;
Object.defineProperty(Deno, "serve", {
  configurable: true,
  value: (h: (req: Request) => Response | Promise<Response>) => {
    handler = h;
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve() };
  },
});
await import("./index.ts");

const call = async (token: string | null, body: unknown, method = "POST"): Promise<{ status: number; body: Record<string, unknown> }> => {
  if (!handler) throw new Error("handler not captured");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await handler(new Request("http://localhost/functions/v1/bank-consent", { method, headers, body: method === "POST" ? JSON.stringify(body) : undefined }));
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
};

const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const opts = { sanitizeOps: false, sanitizeResources: false };

type User = { id: string; token: string; connectionId: string; cleanup: () => Promise<void> };
const user = async (): Promise<User> => {
  const email = `consent-test-${crypto.randomUUID()}@example.invalid`;
  const password = crypto.randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const id = created.data.user?.id;
  if (!id) throw new Error(`createUser: ${created.error?.message}`);
  const token = (await createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password })).data.session?.access_token;
  if (!token) throw new Error("sign in failed");
  const conn = await admin.from("bank_connections").insert({ user_id: id, session_id: `old-${id}`, aspsp_name: "Fakebank", aspsp_country: "DK" }).select("id").single<{ id: string }>();
  if (!conn.data) throw new Error(`connection: ${conn.error?.message}`);
  return { id, token, connectionId: conn.data.id, cleanup: async () => void (await admin.auth.admin.deleteUser(id)) };
};
const stateOf = async (userId: string): Promise<string> => {
  const { data } = await admin.from("bank_consent_states").select("state").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).single<{ state: string }>();
  if (!data) throw new Error("no state row");
  return data.state;
};

Deno.test({ name: "consent: preflight answered with the app origin", ...opts, fn: async () => {
  if (!handler) throw new Error("handler not captured");
  const res = await handler(new Request("http://localhost/x", { method: "OPTIONS" }));
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), APP_URL);
}});

Deno.test({ name: "consent: no JWT -> 401; other user's connection -> 404 with no state written", ...opts, fn: async () => {
  const a = await user();
  const b = await user();
  try {
    assertEquals((await call(null, { connection_id: a.connectionId })).status, 401);
    assertEquals((await call(status.ANON_KEY, { connection_id: a.connectionId })).status, 401);
    assertEquals((await call(b.token, { connection_id: a.connectionId })).status, 404);
    const { count } = await admin.from("bank_consent_states").select("state", { count: "exact", head: true }).eq("user_id", b.id);
    assertEquals(count, 0);
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
}});

Deno.test({ name: "consent: start sends the fixed app redirect and an unguessable state", ...opts, fn: async () => {
  const a = await user();
  try {
    const res = await call(a.token, { connection_id: a.connectionId });
    assertEquals(res.status, 200);
    assertEquals(res.body.url, "https://bank.example.invalid/consent");
    const auth = eb.calls.filter((c) => c.path === "/auth").at(-1)?.body as { redirect_url?: string; state?: string } | undefined;
    assertEquals(auth?.redirect_url, `${APP_URL}/bank/callback`);
    const state = await stateOf(a.id);
    assertEquals(auth?.state, state);
    assert(state.length >= 32);
  } finally {
    await a.cleanup();
  }
}});

Deno.test({ name: "consent: another user's state is refused before the code reaches the bank", ...opts, fn: async () => {
  const a = await user();
  const b = await user();
  try {
    await call(a.token, { connection_id: a.connectionId });
    const state = await stateOf(a.id);
    const before = eb.calls.filter((c) => c.path === "/sessions").length;
    assertEquals((await call(b.token, { code: "c", state })).status, 400);
    assertEquals(eb.calls.filter((c) => c.path === "/sessions").length, before);
    const { count } = await admin.from("bank_consent_states").select("state", { count: "exact", head: true }).eq("state", state);
    assertEquals(count, 1, "a's state survives b's attempt");
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
}});

Deno.test({ name: "consent: expired state (31 min) refused", ...opts, fn: async () => {
  const a = await user();
  try {
    await call(a.token, { connection_id: a.connectionId });
    const state = await stateOf(a.id);
    await admin.from("bank_consent_states").update({ created_at: new Date(Date.now() - 31 * 60_000).toISOString() }).eq("state", state);
    assertEquals((await call(a.token, { code: "c", state })).status, 400);
  } finally {
    await a.cleanup();
  }
}});

Deno.test({ name: "consent: callback maps new uids by identification_hash, updates the same connection, replay refused", ...opts, fn: async () => {
  const a = await user();
  try {
    const hash = `FAKEHASH.${a.id}`;
    const seeded = await admin.from("bank_accounts").insert({
      user_id: a.id, connection_id: a.connectionId, uid: "old-uid", identification_hash: hash, name: "Ivan Testov", currency: "DKK", role: "personal",
      last_booked_on: "2026-11-20",
    }).select("id").single<{ id: string }>();
    assert(seeded.data, seeded.error?.message);
    await call(a.token, { connection_id: a.connectionId });
    const state = await stateOf(a.id);
    eb.session = {
      session_id: `new-${a.id}`,
      accounts: [{ uid: "new-uid", identification_hash: hash, name: "Ivan Testov", currency: "DKK", cash_account_type: "CACC" }],
      aspsp: { name: "Fakebank", country: "DK" },
      access: { valid_until: "2027-05-01T00:00:00Z" },
    };
    const res = await call(a.token, { code: "code-1", state });
    assertEquals(res.status, 200);
    const accounts = await admin.from("bank_accounts").select("id, uid, last_booked_on").eq("user_id", a.id);
    assertEquals(accounts.data?.length, 1, "no duplicate account");
    assertEquals(accounts.data?.[0]?.id, seeded.data.id, "same account row kept (its ledger stays attached)");
    assertEquals(accounts.data?.[0]?.uid, "new-uid");
    assertEquals(accounts.data?.[0]?.last_booked_on, "2026-11-20", "sync window survives re-consent");
    const conns = await admin.from("bank_connections").select("id, session_id, valid_until").eq("user_id", a.id);
    assertEquals(conns.data?.length, 1, "no duplicate connection");
    assertEquals(conns.data?.[0]?.session_id, `new-${a.id}`);
    const sessionsBefore = eb.calls.filter((c) => c.path === "/sessions").length;
    assertEquals((await call(a.token, { code: "code-1", state })).status, 400, "replay refused");
    assertEquals(eb.calls.filter((c) => c.path === "/sessions").length, sessionsBefore);
  } finally {
    eb.session = null;
    await a.cleanup();
  }
}});

Deno.test({ name: "consent: two parallel callbacks with one state exchange the code once", ...opts, fn: async () => {
  const a = await user();
  try {
    await call(a.token, { connection_id: a.connectionId });
    const state = await stateOf(a.id);
    eb.session = { session_id: `par-${a.id}`, accounts: [], aspsp: { name: "Fakebank", country: "DK" }, access: { valid_until: "2027-05-01T00:00:00Z" } };
    const before = eb.calls.filter((c) => c.path === "/sessions").length;
    await Promise.all([call(a.token, { code: "c", state }), call(a.token, { code: "c", state })]);
    assertEquals(eb.calls.filter((c) => c.path === "/sessions").length - before, 1);
  } finally {
    eb.session = null;
    await a.cleanup();
  }
}});

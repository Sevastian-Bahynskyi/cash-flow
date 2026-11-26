// bank-sync auth and throttle, in-process: the handler runs against the LOCAL stack, and every
// call to Enable Banking is answered by a stub (no network, no real keys).
// The gateway's verify_jwt is checked statically by supabase/tests/run.sh (config.toml).
// Run: deno test -A --node-modules-dir=none supabase/functions/bank-sync/index_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient } from "npm:@supabase/supabase-js@2";

const out = await new Deno.Command("supabase", { args: ["status", "-o", "json"], stdout: "piped", stderr: "null" }).output();
const status = JSON.parse(new TextDecoder().decode(out.stdout)) as { API_URL: string; SERVICE_ROLE_KEY: string; ANON_KEY: string };
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(status.API_URL)) throw new Error("refusing: not a local Supabase URL");

const CRON_SECRET = `test-cron-${crypto.randomUUID()}`;
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
Deno.env.set("CRON_SECRET", CRON_SECRET);

// Enable Banking stub: count calls, answer empty.
const ebCalls: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = input instanceof Request ? input.url : String(input);
  if (url.startsWith("https://api.enablebanking.com")) {
    ebCalls.push(url);
    return Promise.resolve(new Response(JSON.stringify({ status: "AUTHORIZED", accounts: [], aspsp: { name: "Fake", country: "DK" }, access: { valid_until: "2027-01-01T00:00:00Z" } }), { status: 200 }));
  }
  return realFetch(input, init);
};

// Capture the handler instead of starting a server.
let handler: ((req: Request) => Response | Promise<Response>) | null = null;
Object.defineProperty(Deno, "serve", {
  configurable: true,
  value: (h: (req: Request) => Response | Promise<Response>) => {
    handler = h;
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve() };
  },
});
await import("./index.ts");

const call = async (headers: Record<string, string>, method = "POST"): Promise<{ status: number; body: Record<string, unknown> }> => {
  if (!handler) throw new Error("handler not captured");
  const res = await handler(new Request("http://localhost/functions/v1/bank-sync", { method, headers, body: method === "POST" ? "{}" : undefined }));
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
};

const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const opts = { sanitizeOps: false, sanitizeResources: false };

Deno.test({ name: "auth: no Authorization and no cron secret -> 401", ...opts, fn: async () => {
  assertEquals((await call({})).status, 401);
}});

Deno.test({ name: "auth: anon key alone is not a user -> 401", ...opts, fn: async () => {
  assertEquals((await call({ Authorization: `Bearer ${status.ANON_KEY}` })).status, 401);
}});

Deno.test({ name: "auth: wrong cron secret -> 401, no bank call", ...opts, fn: async () => {
  const before = ebCalls.length;
  assertEquals((await call({ "x-cron-secret": "wrong", Authorization: `Bearer ${status.ANON_KEY}` })).status, 401);
  assertEquals((await call({ "x-cron-secret": CRON_SECRET.slice(0, -1), Authorization: `Bearer ${status.ANON_KEY}` })).status, 401);
  assertEquals((await call({ "x-cron-secret": "", Authorization: `Bearer ${status.ANON_KEY}` })).status, 401);
  assertEquals(ebCalls.length, before);
}});

Deno.test({ name: "auth: forged JWT -> 401", ...opts, fn: async () => {
  const forged = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: crypto.randomUUID(), role: "authenticated" }))}.c2ln`;
  assertEquals((await call({ Authorization: `Bearer ${forged}` })).status, 401);
}});

Deno.test({ name: "auth: GET rejected", ...opts, fn: async () => {
  assertEquals((await call({}, "GET")).status, 405);
}});

Deno.test({ name: "CORS: browser preflight is answered (web app calls this from the browser)", ...opts, fn: async () => {
  const res = await call({ Origin: "https://example.invalid", "Access-Control-Request-Method": "POST" }, "OPTIONS");
  assert(res.status === 200 || res.status === 204, `preflight status ${res.status}`);
}});

Deno.test({ name: "throttle: a user gets the last run back within 15 min, without a bank call", ...opts, fn: async () => {
  const email = `bank-test-${crypto.randomUUID()}@example.invalid`;
  const password = crypto.randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const userId = created.data.user?.id;
  assert(userId, created.error?.message);
  try {
    const { error } = await admin.from("sync_runs").insert({ user_id: userId, trigger: "cron", ok: true, started_at: new Date(Date.now() - 5 * 60_000).toISOString() });
    assertEquals(error, null);
    const userClient = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
    const session = await userClient.auth.signInWithPassword({ email, password });
    const token = session.data.session?.access_token;
    assert(token, session.error?.message);
    const before = ebCalls.length;
    const res = await call({ Authorization: `Bearer ${token}` });
    assertEquals(res.status, 200);
    assertEquals(res.body.throttled, true);
    assertEquals(ebCalls.length, before);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
}});

Deno.test({ name: "throttle: two parallel user calls start at most one bank sync", ...opts, fn: async () => {
  const email = `bank-test-${crypto.randomUUID()}@example.invalid`;
  const password = crypto.randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const userId = created.data.user?.id;
  assert(userId, created.error?.message);
  try {
    const { error } = await admin.from("bank_connections").insert({ user_id: userId, session_id: `sess-${userId}`, aspsp_name: "Fake", aspsp_country: "DK" });
    assertEquals(error, null);
    const userClient = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
    const token = (await userClient.auth.signInWithPassword({ email, password })).data.session?.access_token;
    assert(token);
    await Promise.all([call({ Authorization: `Bearer ${token}` }), call({ Authorization: `Bearer ${token}` })]);
    const { count } = await admin.from("sync_runs").select("id", { count: "exact", head: true }).eq("user_id", userId);
    assertEquals(count, 1, "parallel calls must not both reach the bank");
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
}});

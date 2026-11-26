import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createEbClient } from "./enable-banking.ts";

const APP_ID = "00000000-fake-4000-8000-000000000000";

const makeKey = async (): Promise<{ pem: string; publicKey: CryptoKey }> => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const b64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, "$1\n");
  return { pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey };
};

const fromB64Url = (s: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

type Call = { url: string; headers: Headers };

// Replaces global fetch for one test; responses come from `route`.
const withFetch = async (route: (url: URL) => Response, body: (calls: Call[]) => Promise<void>): Promise<void> => {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ url: url.toString(), headers: new Headers(init?.headers) });
    return Promise.resolve(route(url));
  };
  try {
    await body(calls);
  } finally {
    globalThis.fetch = original;
  }
};

const ok = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

Deno.test("eb: JWT is RS256 with kid=app id, iss/aud as Enable Banking expects, and verifies", async () => {
  const { pem, publicKey } = await makeKey();
  await withFetch(() => ok({ balances: [] }), async (calls) => {
    const eb = await createEbClient(APP_ID, pem);
    await eb.getBalances("uid-1", null);
    const auth = calls[0]?.headers.get("Authorization") ?? "";
    assert(auth.startsWith("Bearer "));
    const [h, p, s] = auth.slice(7).split(".");
    assert(h && p && s);
    const header = JSON.parse(new TextDecoder().decode(fromB64Url(h)));
    const claims = JSON.parse(new TextDecoder().decode(fromB64Url(p)));
    assertEquals(header, { typ: "JWT", alg: "RS256", kid: APP_ID });
    assertEquals(claims.iss, "enablebanking.com");
    assertEquals(claims.aud, "api.enablebanking.com");
    assert(claims.exp > claims.iat && claims.exp - claims.iat <= 86400);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, fromB64Url(s), new TextEncoder().encode(`${h}.${p}`));
    assert(valid, "signature verifies with the public key");
  });
});

Deno.test("eb: PSU headers only when the user triggered the sync", async () => {
  const { pem } = await makeKey();
  await withFetch(() => ok({ balances: [] }), async (calls) => {
    const eb = await createEbClient(APP_ID, pem);
    await eb.getBalances("uid-1", null);
    await eb.getBalances("uid-1", { ip: "192.0.2.10", userAgent: "TestAgent" });
    assertEquals(calls[0]?.headers.get("Psu-Ip-Address"), null);
    assertEquals(calls[0]?.headers.get("Psu-User-Agent"), null);
    assertEquals(calls[1]?.headers.get("Psu-Ip-Address"), "192.0.2.10");
    assertEquals(calls[1]?.headers.get("Psu-User-Agent"), "TestAgent");
  });
});

Deno.test("eb: transactions follow continuation_key and pass date_from", async () => {
  const { pem } = await makeKey();
  await withFetch((url) => {
    const key = url.searchParams.get("continuation_key");
    if (!key) return ok({ transactions: [{ n: 1 }], continuation_key: "k2" });
    return ok({ transactions: [{ n: 2 }], continuation_key: null });
  }, async (calls) => {
    const eb = await createEbClient(APP_ID, pem);
    const rows = await eb.getTransactions("uid-1", "2026-11-01", null);
    assertEquals(rows.length, 2);
    assertEquals(calls.length, 2);
    assertEquals(new URL(calls[0]?.url ?? "").searchParams.get("date_from"), "2026-11-01");
  });
});

Deno.test("eb: continuation loop is bounded (bank repeating the same key must not loop forever)", async () => {
  const { pem } = await makeKey();
  let served = 0;
  // Stops the loop from outside after 100 pages so the test itself always ends.
  await withFetch(() => (++served > 100 ? new Response("stop", { status: 500 }) : ok({ transactions: [{ n: 1 }], continuation_key: "same" })), async (calls) => {
    const eb = await createEbClient(APP_ID, pem);
    await eb.getTransactions("uid-1", "2026-11-01", null).catch(() => null);
    assert(calls.length <= 50, `continuation loop not bounded: ${calls.length} page fetches`);
  });
});

Deno.test("eb: errors never carry account uids or session ids", async () => {
  const { pem } = await makeKey();
  const uid = "aaaa0001-0000-4000-8000-000000000001";
  await withFetch(() => new Response("denied", { status: 403 }), async () => {
    const eb = await createEbClient(APP_ID, pem);
    const err = await assertRejects(() => eb.getBalances(uid, null));
    assert(err instanceof Error && !err.message.includes(uid));
    const err2 = await assertRejects(() => eb.getSession(uid));
    assert(err2 instanceof Error && !err2.message.includes(uid));
  });
});

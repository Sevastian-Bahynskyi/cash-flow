// AI fallback: what leaves the app (prompt privacy) and what happens when Groq fails. Groq is stubbed.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { aiLabel } from "./ai.ts";
import { type BankTx, type CategoryRef, classify, type Ctx, merchantKey } from "./engine.ts";
import { FAKE_IBAN, OWN_CARD_SUFFIXES, OWNER, PARTNER } from "../fixtures/world.ts";

const categories: CategoryRef[] = [
  { id: "cat-other", name: "Other", parent_id: null },
  { id: "cat-ent", name: "Entertainment", parent_id: null },
  { id: "cat-transfers", name: "Transfers", parent_id: null },
  { id: "cat-mobilepay", name: "MobilePay", parent_id: "cat-transfers" },
];
const ctx: Ctx = {
  now: "2026-11-26",
  categories,
  rules: [],
  memory: [],
  people: [
    { id: "p-self", name: OWNER.name, normalized_name: merchantKey(OWNER.name), kind: "self", alias_of: null },
    { id: "p-partner", name: PARTNER.name, normalized_name: merchantKey(PARTNER.name), kind: "partner", alias_of: null },
  ],
  ownerLabels: new Map(),
  ownCardSuffixes: OWN_CARD_SUFFIXES,
};
const tx = (id: string, over: Partial<BankTx>): BankTx => ({
  id, account_role: "personal", bank: "revolut", amount_minor: -7460, currency: "DKK", booking_date: "2026-11-20",
  creditor_name: null, debtor_name: null, remittance: null, mcc: null, bank_code: "CARD_PAYMENT", ...over,
});
// Leftovers shaped like real rows: Revolut card payments carry the cardholder as debtor; joint rows the joint holder.
const rows: BankTx[] = [
  tx("t1", { creditor_name: "Museum Placebo", debtor_name: OWNER.upper, remittance: "Museum Placebo" }),
  tx("t2", { account_role: "joint", creditor_name: "Kino Phantom", debtor_name: PARTNER.upper, remittance: "Kino Phantom" }),
  tx("t3", { bank: "lunar", bank_code: null, amount_minor: 12000, remittance: `Overførsel ${FAKE_IBAN.friend} ref card *${OWN_CARD_SUFFIXES[0]}` }),
];

const withGroq = async (respond: (body: string) => Response | Promise<Response>, run: (prompts: string[]) => Promise<void>): Promise<void> => {
  const real = globalThis.fetch;
  const prompts: string[] = [];
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith("https://api.groq.com")) return real(input, init);
    const body = typeof init?.body === "string" ? init.body : "";
    prompts.push(body);
    return await respond(body);
  };
  try {
    await run(prompts);
  } finally {
    globalThis.fetch = real;
  }
};
const groqOk = (content: string): Response => new Response(JSON.stringify({ choices: [{ message: { content } }] }));

Deno.test("ai prompt: no own or partner names, no IBANs, no card suffixes", async () => {
  await withGroq(() => groqOk('{"results":[]}'), async (prompts) => {
    await aiLabel(ctx, rows, "test-key");
    assert(prompts.length > 0, "leftovers were sent");
    const text = prompts.join("\n").toLowerCase();
    const leaks: string[] = [];
    for (const n of [OWNER.name, PARTNER.name]) for (const w of n.toLowerCase().split(" ")) if (text.includes(w)) leaks.push("name");
    if (text.includes(FAKE_IBAN.friend.toLowerCase())) leaks.push("iban");
    for (const c of OWN_CARD_SUFFIXES) if (text.includes(`*${c}`)) leaks.push("card");
    assertEquals([...new Set(leaks)], [], "private values reached the AI");
  });
});

Deno.test("ai failure: HTTP error, garbage, timeout-like throw -> deterministic labels unchanged", async () => {
  const deterministic = classify(ctx, rows);
  for (const respond of [
    () => new Response("down", { status: 503 }),
    () => groqOk("not json at all"),
    () => groqOk('{"results":[{"id":"t1","categoryId":"not-a-category","confidence":0.99}]}'),
    (): Response => {
      throw new TypeError("network");
    },
  ]) {
    await withGroq(respond, async () => {
      const got = await aiLabel(ctx, rows, "test-key");
      assertEquals([...got], [...deterministic]);
    });
  }
});

Deno.test("ai: no key -> no call, deterministic labels", async () => {
  await withGroq(() => groqOk('{"results":[]}'), async (prompts) => {
    const got = await aiLabel(ctx, rows, undefined);
    assertEquals(prompts.length, 0);
    assertEquals([...got], [...classify(ctx, rows)]);
  });
});

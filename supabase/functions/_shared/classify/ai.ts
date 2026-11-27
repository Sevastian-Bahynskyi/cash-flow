// AI for leftovers only: rows the deterministic rungs could not place. OpenRouter (OPENROUTER_API_KEY).
// Sure (>= 0.8) answers apply; unsure ones apply as the best guess and go to the Inbox (inside its 30-day window).
// AI never blocks: on any failure the deterministic label (no category, needs review) is returned.
import { classify, inboxFrom, movementFor, type BankTx, type Ctx, type Label } from "./engine.ts";

// Picked on the owner's own corrections (27 Nov 2026): DeepSeek 109/144 right, GLM Flash 100, Jev 92, gpt-oss-120b 61.
export const MODEL = "deepseek/deepseek-v4.1-flash";
const FALLBACK = "~z-ai/glm-flash-latest"; // OpenRouter tries it when the first model fails or is rate-limited
const APPLY_FROM = 0.8;
const BATCH = 12;
const TIMEOUT_MS = 60000;

type AiResult = { id: string; categoryId: string; name: string; reason: string; confidence: number };
type ChatPayload = { choices?: { message?: { content?: string } }[] };

const clamp = (v: number): number => Math.max(0, Math.min(1, v));
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** Parses the model's JSON; drops rows with unknown ids or categories. */
export const parseAiResults = (text: string, ids: ReadonlySet<string>, categoryIds: ReadonlySet<string>): AiResult[] => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch (error) {
    console.warn("[classify/ai] unparseable model output", error instanceof Error ? error.message : String(error));
    return [];
  }
  const rows = raw && typeof raw === "object" && "results" in raw && Array.isArray(raw.results) ? raw.results : [];
  const out: AiResult[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = str(r.id, 200);
    const categoryId = str(r.categoryId, 64);
    if (!ids.has(id) || !categoryIds.has(categoryId)) continue;
    const confidence = typeof r.confidence === "number" ? clamp(r.confidence) : clamp(Number(r.confidence) || 0);
    out.push({ id, categoryId, name: str(r.name, 60), reason: str(r.reason, 120), confidence });
  }
  return out;
};

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Removes what must never leave the app: names of self/partner/family people, IBANs, card suffixes, long numbers. */
export const scrubber = (ctx: Ctx): ((text: string | null) => string) => {
  const byId = new Map(ctx.people.map((p) => [p.id, p]));
  const kindOf = (p: Ctx["people"][number]) => (p.alias_of ? byId.get(p.alias_of)?.kind ?? p.kind : p.kind);
  const tokens = new Set<string>();
  for (const p of ctx.people) {
    if (kindOf(p) === "settle_up" || kindOf(p) === "ignore") continue;
    for (const w of `${p.name} ${p.normalized_name}`.toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (w.length >= 3) tokens.add(w);
  }
  const names = tokens.size ? new RegExp(`(?<![\\p{L}\\p{N}])(${[...tokens].map(escape).join("|")})\\p{L}*`, "giu") : null;
  return (text) => {
    let out = (text ?? "").replace(/\b[a-z]{2}\d{2}(?:\s?[a-z0-9]{4}){2,7}(?:\s?[a-z0-9]{1,4})?\b/gi, "[iban]");
    out = out.replace(/\*+\s?\d{4}/g, "*[card]").replace(/\d{6,}/g, "[number]");
    if (names) out = out.replace(names, "[person]");
    return out.trim() || "-";
  };
};

export const prompt = (ctx: Ctx, txs: BankTx[], labels: Map<string, Label>): string => {
  const byId = new Map(ctx.categories.map((c) => [c.id, c]));
  const scrub = scrubber(ctx);
  const categories = ctx.categories
    .map((c) => `${c.parent_id ? `${byId.get(c.parent_id)?.name ?? "?"} / ` : ""}${c.name} [${c.id}]`)
    .join("\n");
  const rows = txs
    .map((t) =>
      [
        `id=${t.id}`,
        `direction=${t.amount_minor < 0 ? "out" : "in"}`,
        `amount=${(Math.abs(t.amount_minor) / 100).toFixed(2)} ${t.currency}`,
        `account=${t.account_role}`,
        // Only the other party: on Revolut card payments the debtor is the card holder.
        `counterparty=${scrub(t.amount_minor < 0 || t.bank_code === "CARD_REFUND" ? t.creditor_name : t.debtor_name)}`,
        `text=${scrub(t.remittance)}`,
        `mcc=${t.mcc ?? "-"}`,
        `bank_code=${t.bank_code ?? "-"}`,
        `merchant_key=${scrub(labels.get(t.id)?.merchant_key ?? null)}`,
      ].join("; "),
    )
    .join("\n");
  return [
    "You label Danish bank transactions that deterministic merchant rules could not place.",
    'Return strict JSON only: {"results":[{"id":"row id","name":"clean merchant name","categoryId":"one id from the list","reason":"one short English line why","confidence":0.0}]}',
    "Use the merchant or service brand, not the payment rail (MobilePay, Klarna, Zettle, SumUp are rails).",
    "MobilePay category only for money between people. Money in from a shop is a refund.",
    "confidence is your probability that the category is right; be honest, 0.5 when guessing.",
    `Rows:\n${rows}`,
    `Categories:\n${categories}`,
  ].join("\n\n");
};

export const callModel = async (key: string, body: string, model = MODEL): Promise<string | null> => {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      models: [...new Set([model, FALLBACK])],
      temperature: 0,
      // a short answer per row; the cap leaves room for reasoning models
      max_tokens: 8000,
      reasoning: { effort: "low" },
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: "Return strict JSON only." }, { role: "user", content: body }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    console.error("[classify/ai] model request failed", { status: response.status });
    return null;
  }
  const payload = (await response.json()) as ChatPayload;
  return payload.choices?.[0]?.message?.content ?? null;
};

/** Labels for every given row; only rows without a deterministic category are sent to the model. */
export async function aiLabel(ctx: Ctx, txs: BankTx[], key = Deno.env.get("OPENROUTER_API_KEY")): Promise<Map<string, Label>> {
  const labels = classify(ctx, txs);
  const leftovers = txs.filter((t) => {
    const l = labels.get(t.id);
    return l && !l.category_id && l.movement !== "ignore";
  });
  if (!key || leftovers.length === 0) return labels;

  const categoryIds = new Set(ctx.categories.map((c) => c.id));
  const reviewFrom = inboxFrom(ctx.now);
  for (let i = 0; i < leftovers.length; i += BATCH) {
    const batch = leftovers.slice(i, i + BATCH);
    let text: string | null = null;
    try {
      text = await callModel(key, prompt(ctx, batch, labels));
    } catch (error) {
      console.error("[classify/ai] model error", error instanceof Error ? error.message : String(error));
    }
    if (!text) continue;
    const txById = new Map(batch.map((t) => [t.id, t]));
    for (const r of parseAiResults(text, new Set(txById.keys()), categoryIds)) {
      const t = txById.get(r.id);
      const base = labels.get(r.id);
      if (!t || !base) continue;
      const sure = r.confidence >= APPLY_FROM;
      labels.set(r.id, {
        ...base,
        category_id: r.categoryId,
        movement: movementFor(ctx.categories, r.categoryId, t.amount_minor),
        name: r.name || base.name,
        reason: r.reason || "Best guess by AI",
        reason_source: "ai",
        confidence: Math.round(r.confidence * 100) / 100,
        needs_review: !sure && t.booking_date >= reviewFrom,
      });
    }
  }
  return labels;
}

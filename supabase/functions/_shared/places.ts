// Merchant places: after each sync the model says where each new merchant is (country, city, city centre),
// for trips and the spending map. Never blocks a sync: a merchant the model skipped is asked again next time;
// one it could not place is saved with nulls and not asked again.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { callModel, scrubber } from "./classify/ai.ts";
import { loadContext } from "./classify/context.ts";

const BATCH = 12;
const ISO2 = /^[A-Z]{2}$/;
// Money between people and own accounts has no place.
const NO_SHOP = new Set(["moved", "topup", "person", "ignore"]);

/** The key the app looks places up by. Keep in step with src/core/domain/trips.ts placeKey. */
export const placeKey = (t: { place_key?: string | null; merchant_key: string | null; name: string }): string => (t.place_key || t.merchant_key || t.name).trim().toLowerCase();
/** A bank row's branch text, e.g. "lidl198arhushasle" or "mercadona cl del garbi". */
export const branchKey = (b: { remittance: string | null; creditor_name: string | null }): string | null => {
  const k = (b.remittance || b.creditor_name || "").trim().toLowerCase().replace(/\s+/g, " ");
  return k || null;
};

type Tx = { id: string; bank_transaction_id: string | null; place_key: string | null; name: string; merchant_key: string | null; country_iso: string | null; category_id: string | null; movement: string | null; counterparty_person_id: string | null; is_salary: boolean; is_shared_topup: boolean };
type Merchant = { key: string; name: string; bank: string | null; mcc: string | null; country: string | null; category: string | null; n: number };
export type Place = { country_iso: string | null; city: string | null; lat: number | null; lng: number | null; online: boolean };

const prompt = (rows: Merchant[]): string => [
  "Each row is a card payment merchant from a personal bank account of someone who lives in Aarhus, Denmark: row | name | bank text | card merchant code | country noted by the owner | category.",
  "Say where the merchant is: ISO 3166-1 alpha-2 country, the city, and that city's centre as lat/lng.",
  "Online shops, apps, subscriptions and web services (Spotify, Apple, Zalando, Wolt, Temu, Claude): online true, country/city/lat/lng null.",
  "A Danish chain without a branch city in the text (Netto, Rema 1000, DSB): country DK, city Aarhus.",
  "Use the bank text for the branch: 'lidl198arhushasle' is Lidl in Aarhus, 'MERCADONA CL DEL GARBI' is in Spain, 'METRO BARCELONA' is Barcelona.",
  "In Denmark with no city in the text, use Aarhus (the owner's home), not Copenhagen. Abroad with only the country known, give its capital. When you cannot tell at all, every field null and online false.",
  'Return strict JSON only: {"results":[{"key":"the row number","country":"ES","city":"Barcelona","lat":41.39,"lng":2.17,"online":false}]}',
  `Rows:\n${rows.map((m, i) => `${i} | ${m.name} | ${m.bank ?? "-"} | ${m.mcc ?? "-"} | ${m.country ?? "-"} | ${m.category ?? "-"}`).join("\n")}`,
].join("\n\n");

const num = (v: unknown, lim: number): number | null => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim ? Math.round(v * 1e4) / 1e4 : null);
const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Places the model gave, by row number; rows it skipped are absent (retried next sync). */
export const parsePlaces = (raw: string | null, keys: ReadonlySet<string>): Map<string, Place> => {
  const out = new Map<string, Place>();
  const match = raw?.match(/\{[\s\S]*\}/);
  if (!match) return out;
  try {
    const parsed = JSON.parse(match[0]) as { results?: Record<string, unknown>[] };
    for (const r of parsed.results ?? []) {
      const k = typeof r.key === "number" ? String(r.key) : r.key;
      if (typeof k !== "string" || !keys.has(k)) continue;
      const online = r.online === true;
      const country = typeof r.country === "string" && ISO2.test(r.country.toUpperCase()) ? r.country.toUpperCase() : null;
      const lat = num(r.lat, 90), lng = num(r.lng, 180);
      const located = !online && country !== null && lat !== null && lng !== null;
      out.set(k, { online, country_iso: online ? null : country, city: located ? text(r.city, 80) : null, lat: located ? lat : null, lng: located ? lng : null });
    }
  } catch (error) {
    console.warn("[places] unparseable model output", error instanceof Error ? error.message : String(error));
  }
  return out;
};

const all = async <T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> => {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
};

/** Places a user's merchants that have no place row yet, most used first. */
export async function fillPlaces(db: SupabaseClient, userId: string, limit = 75, key = Deno.env.get("OPENROUTER_API_KEY")): Promise<{ checked: number; placed: number }> {
  if (!key) return { checked: 0, placed: 0 };
  const [seen, txs, ctx] = await Promise.all([
    all<{ key: string }>((a, b) => db.from("merchant_places").select("key").eq("user_id", userId).order("key").range(a, b)),
    all<Tx>((a, b) => db.from("transactions").select("id,bank_transaction_id,place_key,name,merchant_key,country_iso,category_id,movement,counterparty_person_id,is_salary,is_shared_topup")
      .eq("user_id", userId).eq("kind", "expense").neq("status", "void").order("id").range(a, b)),
    loadContext(db, userId),
  ]);
  const done = new Set(seen.map((r) => r.key));
  // Bank rows get their branch's text as place key once, so two shops of one chain are placed apart.
  const bank = new Map<string, { remittance: string | null; creditor_name: string | null; mcc: string | null }>();
  const ids = txs.filter((t) => t.bank_transaction_id).map((t) => t.bank_transaction_id!);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("bank_transactions").select("id,remittance,creditor_name,mcc").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const b of data ?? []) bank.set(b.id as string, b as { remittance: string | null; creditor_name: string | null; mcc: string | null });
  }
  const fresh = new Map<string, string[]>();
  for (const t of txs) {
    const b = t.bank_transaction_id ? bank.get(t.bank_transaction_id) : undefined;
    const k = b && !t.place_key ? branchKey(b) : null;
    if (!k) continue;
    t.place_key = k;
    fresh.set(k, [...(fresh.get(k) ?? []), t.id]);
  }
  for (const [k, rowIds] of fresh) {
    for (let i = 0; i < rowIds.length; i += 200) {
      const { error } = await db.from("transactions").update({ place_key: k }).in("id", rowIds.slice(i, i + 200));
      if (error) console.error("[places] place key not saved", error.message);
    }
  }
  const scrub = scrubber(ctx);
  const catName = new Map(ctx.categories.map((c) => [c.id, c.name]));
  const merchants = new Map<string, Merchant>();
  for (const t of txs) {
    const k = placeKey(t);
    if (!k || done.has(k) || t.is_salary || t.is_shared_topup || t.counterparty_person_id || NO_SHOP.has(t.movement ?? "")) continue;
    const b = t.bank_transaction_id ? bank.get(t.bank_transaction_id) : undefined;
    const m = merchants.get(k) ?? { key: k, name: t.name.trim(), bank: b ? [b.creditor_name, b.remittance].filter(Boolean).join(" / ") : t.merchant_key, mcc: b?.mcc ?? null, country: t.country_iso, category: catName.get(t.category_id ?? "") ?? null, n: 0 };
    m.n += 1;
    merchants.set(k, m);
  }
  const todo = [...merchants.values()].sort((a, b) => b.n - a.n).slice(0, limit);

  let placed = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    let raw: string | null = null;
    try {
      // Rows go by number, with names of people the owner knows scrubbed.
      raw = await callModel(key, prompt(batch.map((m) => ({ ...m, name: scrub(m.name), bank: scrub(m.bank) }))));
    } catch (error) {
      console.error("[places] model error", error instanceof Error ? error.message : String(error));
    }
    const places = parsePlaces(raw, new Set(batch.map((_, n) => String(n))));
    const rows = batch.flatMap((m, n) => {
      const p = places.get(String(n));
      if (!p) return [];
      if (p.lat !== null) placed += 1;
      return [{ user_id: userId, key: m.key, ...p, checked_at: new Date().toISOString() }];
    });
    if (rows.length) {
      const { error } = await db.from("merchant_places").upsert(rows, { onConflict: "user_id,key" });
      if (error) console.error("[places] save failed", error.message);
    }
  }
  return { checked: todo.length, placed };
}

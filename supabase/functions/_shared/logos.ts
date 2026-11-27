// Merchant logos: after each sync the model names the website of merchants that have no logo row yet;
// the site's touch icon (else Google's favicon service) is cached once per website in the merchant-logos bucket.
// Never blocks a sync: any failure leaves the merchant without a logo and the app shows its category icon.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { callModel, scrubber } from "./classify/ai.ts";
import { loadContext } from "./classify/context.ts";

const BUCKET = "merchant-logos";
const BATCH = 25;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IMAGE = /^image\/(png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon)$/;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
// Money between people and own accounts has no shop behind it.
const NO_SHOP = new Set(["moved", "topup", "person"]);

/** The key the app looks logos up by. Keep in step with src/core/data/model.ts. */
export const logoKey = (name: string): string => name.trim().toLowerCase();

type Tx = { name: string; merchant_key: string | null; category_id: string | null; movement: string | null; counterparty_person_id: string | null; is_salary: boolean; is_shared_topup: boolean };
type Merchant = { key: string; name: string; bank: string | null; category: string | null; n: number };
type Image = { bytes: Uint8Array; type: string };

/** Icon links in a page's head, the smallest one that is still sharp first. */
export const iconLinks = (html: string, base: string): string[] => {
  const out: { href: string; size: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = tag.match(/\brel\s*=\s*["']?([^"'>]+)/i)?.[1]?.toLowerCase() ?? "";
    const touch = rel.includes("apple-touch-icon");
    if (!touch && !/(^|\s)icon(\s|$)/.test(rel)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? tag.match(/\bhref\s*=\s*([^\s>]+)/i)?.[1];
    if (!href || /\.svg(\?|#|$)/i.test(href) || href.startsWith("data:")) continue;
    const size = Number(tag.match(/\bsizes\s*=\s*["']?(\d+)/i)?.[1] ?? (touch ? 180 : 0));
    try {
      out.push({ href: new URL(href.replace(/&amp;/g, "&"), base).href, size });
    } catch { /* bad href */ }
  }
  return out.filter((l) => l.size >= 120).sort((a, b) => a.size - b.size).map((l) => l.href);
};

/** Width of a PNG, or null for other formats. */
const pngWidth = (b: Uint8Array): number | null =>
  b.length > 24 && b[0] === 0x89 && b[1] === 0x50 ? ((b[16]! << 24) | (b[17]! << 16) | (b[18]! << 8) | b[19]!) : null;

const getImage = async (url: string): Promise<Image | null> => {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(6000) });
    const type = r.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!r.ok || !IMAGE.test(type)) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    const w = pngWidth(bytes);
    return bytes.length > 300 && (w === null || w >= 32) ? { bytes, type } : null;
  } catch {
    return null;
  }
};

const squash = (v: string): string => v.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
type AppHit = { trackName?: string; sellerName?: string; sellerUrl?: string; artworkUrl512?: string };
/** The App Store app of this brand, if the first hits clearly belong to it: seller or app name carries the brand, or the seller's site is the shop's. */
export const pickApp = (hits: readonly AppHit[], domain: string): AppHit | null => {
  const root = squash(domain.split(".")[0] ?? "");
  if (root.length < 2) return null;
  return hits.slice(0, 3).find((h) => {
    const host = (() => { try { return new URL(h.sellerUrl ?? "").hostname.replace(/^www\./, ""); } catch { return ""; } })();
    const sameSite = host !== "" && squash(host.split(".")[0] ?? "") === root;
    const named = root.length >= 3 && (squash(h.sellerName ?? "").startsWith(root) || squash(h.trackName ?? "").startsWith(root));
    return Boolean(h.artworkUrl512) && (sameSite || named);
  }) ?? null;
};

/** The brand's App Store icon (512 px, square): sharper than any favicon. Danish store first. */
export const appIcon = async (domain: string, name: string): Promise<Image | null> => {
  const term = name.replace(/\.(com|dk|de|co\.uk|eu)$/i, "").trim() || domain.split(".")[0]!;
  try {
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=software&country=dk&limit=3`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const hit = pickApp(((await r.json()) as { results?: AppHit[] }).results ?? [], domain);
    return hit?.artworkUrl512 ? await getImage(hit.artworkUrl512) : null;
  } catch {
    return null;
  }
};

export const fetchIcon = async (domain: string): Promise<Image | null> => {
  try {
    const page = await fetch(`https://${domain}`, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(6000) });
    if (page.ok) {
      for (const href of iconLinks((await page.text()).slice(0, 300_000), page.url).slice(0, 3)) {
        const img = await getImage(href);
        if (img) return img;
      }
    }
  } catch { /* site down or blocks bots: fall back to Google */ }
  return await getImage(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
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

const prompt = (rows: Merchant[]): string => [
  "Each row is a merchant from a Danish personal bank account: row | display name | bank text | category.",
  "Give the website whose logo shows that brand. Use the brand's Danish site when it has one (netto.dk, rema1000.dk, bilka.dk), else its main site (wolt.com, apple.com).",
  "Payment rails (MobilePay, Klarna, Zettle, SumUp, Nets, PayPal) are not the merchant: name the shop behind them, or null.",
  "Well-known chains and brands always get their domain (Amazon, Spar, Lidl, IKEA, H&M, Shell), also when the name is shortened or has a branch or city in it.",
  "domain is null for private persons, [person], own transfers, salary, bank fees, generic words (fuel, flowers, rent) and any small shop you cannot identify with confidence. A wrong logo is worse than none.",
  'Return strict JSON only: {"results":[{"key":"the row number","domain":"example.dk or null"}]}',
  `Rows:\n${rows.map((m, i) => `${i} | ${m.name} | ${m.bank ?? "-"} | ${m.category ?? "-"}`).join("\n")}`,
].join("\n\n");

/** Domains the model gave, by key; keys it skipped are absent (retried next sync). */
export const parseDomains = (text: string | null, keys: ReadonlySet<string>): Map<string, string | null> => {
  const out = new Map<string, string | null>();
  const match = text?.match(/\{[\s\S]*\}/);
  if (!match) return out;
  try {
    const raw = JSON.parse(match[0]) as { results?: { key?: unknown; domain?: unknown }[] };
    for (const r of raw.results ?? []) {
      const k = typeof r.key === "number" ? String(r.key) : r.key;
      if (typeof k !== "string" || !keys.has(k)) continue;
      const d = typeof r.domain === "string" ? r.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") : "";
      out.set(k, DOMAIN.test(d) ? d : null);
    }
  } catch (error) {
    console.warn("[logos] unparseable model output", error instanceof Error ? error.message : String(error));
  }
  return out;
};

/** Fetches and stores a website's icon: the brand's app icon (path "<domain>.app"), else the site's own icon (path "<domain>"). */
export async function storeIcon(db: SupabaseClient, domain: string, name: string): Promise<string | null> {
  const app = await appIcon(domain, name);
  const img = app ?? await fetchIcon(domain);
  if (!img) return null;
  const path = app ? `${domain}.app` : domain;
  const { error } = await db.storage.from(BUCKET).upload(path, img.bytes, { contentType: img.type, upsert: true });
  if (error) console.error("[logos] upload failed", domain, error.message);
  return error ? null : path;
}

/** Swaps favicons for sharper app icons where the brand has an app, and retries websites that gave no icon. */
export async function upgradeLogos(db: SupabaseClient): Promise<{ upgraded: number; tried: number }> {
  const rows = await all<{ key: string; domain: string; path: string | null }>((a, b) => db.from("merchant_logos").select("key,domain,path").not("domain", "is", null).order("key").range(a, b));
  const byDomain = new Map<string, { key: string; path: string | null }>();
  for (const r of rows) if (!byDomain.has(r.domain) || (r.path && !byDomain.get(r.domain)!.path)) byDomain.set(r.domain, r);
  let upgraded = 0;
  const todo = [...byDomain].filter(([, r]) => !r.path?.endsWith(".app"));
  for (const [domain, r] of todo) {
    let path: string | null;
    if (r.path) {
      const img = await appIcon(domain, r.key);
      if (!img) continue;
      path = `${domain}.app`;
      const { error } = await db.storage.from(BUCKET).upload(path, img.bytes, { contentType: img.type, upsert: true });
      if (error) continue;
    } else path = await storeIcon(db, domain, r.key);
    if (!path || path === r.path) continue;
    const { error } = await db.from("merchant_logos").update({ path }).eq("domain", domain);
    if (!error) upgraded += 1;
  }
  return { upgraded, tried: todo.length };
}

/** Finds websites and icons for a user's merchants that have no logo row yet, most used first. */
export async function fillLogos(db: SupabaseClient, userId: string, limit = 50, key = Deno.env.get("OPENROUTER_API_KEY")): Promise<{ checked: number; found: number }> {
  if (!key) return { checked: 0, found: 0 };
  const [seen, txs, ctx] = await Promise.all([
    all<{ key: string }>((a, b) => db.from("merchant_logos").select("key").eq("user_id", userId).order("key").range(a, b)),
    all<Tx>((a, b) => db.from("transactions").select("name,merchant_key,category_id,movement,counterparty_person_id,is_salary,is_shared_topup")
      .eq("user_id", userId).neq("status", "void").order("id").range(a, b)),
    loadContext(db, userId),
  ]);
  const done = new Set(seen.map((r) => r.key));
  const scrub = scrubber(ctx);
  const catName = new Map(ctx.categories.map((c) => [c.id, c.name]));
  const merchants = new Map<string, Merchant>();
  for (const t of txs) {
    const k = logoKey(t.name ?? "");
    if (!k || done.has(k) || t.is_salary || t.is_shared_topup || t.counterparty_person_id || NO_SHOP.has(t.movement ?? "")) continue;
    const m = merchants.get(k) ?? { key: k, name: t.name.trim(), bank: t.merchant_key, category: catName.get(t.category_id ?? "") ?? null, n: 0 };
    m.n += 1;
    merchants.set(k, m);
  }
  const todo = [...merchants.values()].sort((a, b) => b.n - a.n).slice(0, limit);

  // One fetch per website, shared by every name that points at it (Lidl, LIDL 198 ...).
  const pathOf = new Map<string, Promise<string | null>>();
  const lookup = async (domain: string, name: string): Promise<string | null> => {
    const { data: cached } = await db.from("merchant_logos").select("path").eq("domain", domain).not("path", "is", null).limit(1).maybeSingle();
    if (cached?.path) return cached.path as string;
    return await storeIcon(db, domain, name);
  };
  const iconPath = (domain: string, name: string): Promise<string | null> => {
    if (!pathOf.has(domain)) pathOf.set(domain, lookup(domain, name));
    return pathOf.get(domain)!;
  };

  let found = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    let text: string | null = null;
    try {
      // Rows go by number, with names of people the owner knows scrubbed.
      text = await callModel(key, prompt(batch.map((m) => ({ ...m, name: scrub(m.name), bank: scrub(m.bank) }))));
    } catch (error) {
      console.error("[logos] model error", error instanceof Error ? error.message : String(error));
    }
    const domains = parseDomains(text, new Set(batch.map((_, n) => String(n))));
    const rows = await Promise.all(batch.filter((_, n) => domains.has(String(n))).map(async (m) => {
      const domain = domains.get(String(batch.indexOf(m))) ?? null;
      const path = domain ? await iconPath(domain, m.name) : null;
      if (path) found += 1;
      return { user_id: userId, key: m.key, domain, path, checked_at: new Date().toISOString() };
    }));
    if (rows.length) {
      const { error } = await db.from("merchant_logos").upsert(rows, { onConflict: "user_id,key" });
      if (error) console.error("[logos] save failed", error.message);
    }
  }
  return { checked: todo.length, found };
}

// Merchant logos, run by hand (no AI in the sync):
//   deno run -A scripts/logos.ts todo > todo.json      merchants with no logo row yet, most used first
//   deno run -A scripts/logos.ts save domains.json     {"merchant key": "site.dk" | null}: fetch, cache, record
// The site's touch icon (else Google's favicon service) is cached once per website in the merchant-logos bucket.
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. A merchant without a logo shows its category icon.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "merchant-logos";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IMAGE = /^image\/(png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon)$/;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
// Money between people and own accounts has no shop behind it.
const NO_SHOP = new Set(["moved", "topup", "person"]);

/** The key the app looks logos up by. Keep in step with src/core/data/model.ts. */
export const logoKey = (name: string): string => name.trim().toLowerCase();

type Tx = { name: string; merchant_key: string | null; category_id: string | null; movement: string | null; counterparty_person_id: string | null; is_salary: boolean; is_shared_topup: boolean };
type Merchant = { key: string; name: string; bank: string | null; category: string | null; n: number; users: string[] };
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

const fetchIcon = async (domain: string): Promise<Image | null> => {
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

if (import.meta.main) {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const [cmd, file] = Deno.args;
  const seen = new Set((await all<{ user_id: string; key: string }>((a, b) => db.from("merchant_logos").select("user_id,key").order("key").range(a, b)))
    .map((r) => `${r.user_id}|${r.key}`));
  const txs = await all<Tx & { user_id: string }>((a, b) => db.from("transactions")
    .select("user_id,name,merchant_key,category_id,movement,counterparty_person_id,is_salary,is_shared_topup").neq("status", "void").order("id").range(a, b));
  const cats = await all<{ id: string; name: string }>((a, b) => db.from("categories").select("id,name").order("id").range(a, b));
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const merchants = new Map<string, Merchant>();
  for (const t of txs) {
    const k = logoKey(t.name ?? "");
    if (!k || seen.has(`${t.user_id}|${k}`) || t.is_salary || t.is_shared_topup || t.counterparty_person_id || NO_SHOP.has(t.movement ?? "")) continue;
    const m = merchants.get(k) ?? { key: k, name: t.name.trim(), bank: t.merchant_key, category: catName.get(t.category_id ?? "") ?? null, n: 0, users: [] };
    m.n += 1;
    if (!m.users.includes(t.user_id)) m.users.push(t.user_id);
    merchants.set(k, m);
  }

  if (cmd === "todo") {
    console.log(JSON.stringify([...merchants.values()].sort((a, b) => b.n - a.n).map(({ users: _u, ...m }) => m), null, 1));
  } else if (cmd === "save" && file) {
    const domains = JSON.parse(await Deno.readTextFile(file)) as Record<string, string | null>;
    // One fetch per website, shared by every name that points at it (Lidl, LIDL 198 ...).
    const pathOf = new Map<string, Promise<string | null>>();
    const lookup = async (domain: string): Promise<string | null> => {
      const { data: cached } = await db.from("merchant_logos").select("path").eq("domain", domain).not("path", "is", null).limit(1).maybeSingle();
      if (cached?.path) return cached.path;
      const img = await fetchIcon(domain);
      if (!img) return null;
      const { error } = await db.storage.from(BUCKET).upload(domain, img.bytes, { contentType: img.type, upsert: true });
      if (error) console.error("upload failed", domain, error.message);
      return error ? null : domain;
    };
    const iconPath = (domain: string): Promise<string | null> => {
      if (!pathOf.has(domain)) pathOf.set(domain, lookup(domain));
      return pathOf.get(domain)!;
    };
    const rows = await Promise.all(Object.entries(domains).filter(([k]) => merchants.has(k)).map(async ([k, raw]) => {
      const domain = raw && DOMAIN.test(raw.trim().toLowerCase()) ? raw.trim().toLowerCase() : null;
      const path = domain ? await iconPath(domain) : null;
      console.log(`${path ? "logo" : domain ? "none" : "skip"}\t${k}\t${domain ?? ""}`);
      return merchants.get(k)!.users.map((user_id) => ({ user_id, key: k, domain, path, checked_at: new Date().toISOString() }));
    }));
    const { error } = await db.from("merchant_logos").upsert(rows.flat(), { onConflict: "user_id,key" });
    if (error) throw new Error(error.message);
  } else {
    console.error("Use: todo | save <domains.json>");
    Deno.exit(1);
  }
}

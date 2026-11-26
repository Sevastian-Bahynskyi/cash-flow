// Loads everything the classifier needs for one user. Service-role callers must pass the user's id.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { deriveOwnerLabels, merchantKey, type CategoryRef, type Ctx, type PersonKind } from "./engine.ts";

type RuleRow = { pattern: string; kind: string; category_id: string | null; canonical_merchant: string | null; is_blocked: boolean };
type MemoryRow = { normalized_merchant: string; kind: string; category_id: string | null; canonical_merchant: string | null; support_ratio: number | string | null };
type PersonRow = { id: string; name: string; normalized_name: string; kind: string; alias_of: string | null };

const PAGE = 1000;
const PERSON_KINDS: readonly PersonKind[] = ["self", "partner", "settle_up", "family", "ignore"];

const toKind = (value: string): PersonKind => PERSON_KINDS.find((k) => k === value) ?? "settle_up";
const toTxKind = (value: string): "expense" | "income" => (value === "income" ? "income" : "expense");

const fail = (what: string, message: string): never => {
  throw new Error(`classify context: ${what}: ${message}`);
};

export async function loadContext(db: SupabaseClient, userId: string, now = new Date().toISOString().slice(0, 10)): Promise<Ctx> {
  // Categories include the system rows (user_id null); rules, memory, people and profile are per user only.
  const [cats, rules, memory, people, profile] = await Promise.all([
    db.from("categories").select("id, name, parent_id").or(`user_id.eq.${userId},user_id.is.null`).overrideTypes<CategoryRef[], { merge: false }>(),
    db.from("merchant_category_rules").select("pattern, kind, category_id, canonical_merchant, is_blocked").eq("user_id", userId).overrideTypes<RuleRow[], { merge: false }>(),
    db.from("merchant_category_memory").select("normalized_merchant, kind, category_id, canonical_merchant, support_ratio").eq("user_id", userId).overrideTypes<MemoryRow[], { merge: false }>(),
    db.from("transfer_people").select("id, name, normalized_name, kind, alias_of").eq("user_id", userId).overrideTypes<PersonRow[], { merge: false }>(),
    db.from("profiles").select("own_card_suffixes").eq("user_id", userId).maybeSingle().overrideTypes<{ own_card_suffixes: string[] } | null, { merge: false }>(),
  ]);
  if (cats.error) fail("categories", cats.error.message);
  if (rules.error) fail("rules", rules.error.message);
  if (memory.error) fail("memory", memory.error.message);
  if (people.error) fail("people", people.error.message);
  if (profile.error) fail("profile", profile.error.message);

  // Your hand-entered rows only; bank rows never vote on your own labels.
  const manual: { name: string; category_id: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await db
      .from("transactions")
      .select("name, category_id")
      .eq("user_id", userId)
      .eq("source", "manual")
      .order("id")
      .range(from, from + PAGE - 1)
      .overrideTypes<{ name: string; category_id: string | null }[], { merge: false }>();
    if (page.error) fail("manual transactions", page.error.message);
    const rows = page.data ?? [];
    for (const r of rows) if (r.category_id) manual.push({ name: r.name, category_id: r.category_id });
    if (rows.length < PAGE) break;
  }

  const categories = cats.data ?? [];
  return {
    now,
    categories,
    rules: (rules.data ?? []).map((r) => ({ ...r, kind: toTxKind(r.kind) })),
    memory: (memory.data ?? []).map((m) => ({ ...m, kind: toTxKind(m.kind), support_ratio: m.support_ratio === null ? null : Number(m.support_ratio) })),
    people: (people.data ?? []).map((p) => ({ ...p, kind: toKind(p.kind) })),
    ownerLabels: deriveOwnerLabels(manual.map((r) => ({ merchant_key: merchantKey(r.name), category_id: r.category_id })), categories),
    ownCardSuffixes: profile.data?.own_card_suffixes ?? [],
  };
}

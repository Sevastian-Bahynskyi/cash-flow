// Deterministic transaction labeler: one rung after another, first hit wins, every label says why.
// Rungs: holds -> own moves & top-ups -> salary/SU -> people -> your own labels -> rules -> memory
// -> knowledge merchants -> chain patterns -> MCC -> refund rule. AI (ai.ts) only sees what is left.
// Personal facts (names, cards) come from the context, never from this file.
import { normalizeAsciiText, normalizeMerchantContext } from "../merchant-intelligence.ts";
import knowledgeJson from "./knowledge.json" with { type: "json" };

export type AccountRole = "personal" | "joint" | "savings";
export type Movement = "spend" | "income" | "moved" | "topup" | "person" | "refund" | "ignore";
export type ReasonSource = "transfer" | "salary" | "person" | "rule" | "memory" | "mcc" | "ai" | "you" | "manual";
export type PersonKind = "self" | "partner" | "settle_up" | "family" | "ignore";

export type BankTx = {
  id: string;
  account_role: AccountRole;
  bank: string; // 'lunar' | 'revolut' | other, from aspsp_name lowercased
  amount_minor: number; // signed, account currency
  currency: string;
  booking_date: string;
  creditor_name: string | null;
  debtor_name: string | null;
  remittance: string | null;
  mcc: string | null;
  bank_code: string | null;
};

export type Label = {
  category_id: string | null;
  movement: Movement;
  shared: boolean;
  paid_by: "me" | "partner" | null;
  is_salary: boolean;
  is_shared_topup: boolean;
  shared_participant: "me" | "gf" | null;
  counterparty_person_id: string | null;
  merchant_key: string;
  name: string;
  reason: string;
  reason_source: ReasonSource; // "ai" with no category = still waiting for AI or you
  confidence: number;
  needs_review: boolean;
};

export type CategoryRef = { id: string; name: string; parent_id: string | null };
export type RuleRef = {
  pattern: string;
  kind: "expense" | "income";
  category_id: string | null;
  canonical_merchant: string | null;
  is_blocked: boolean;
};
export type MemoryRef = {
  normalized_merchant: string;
  kind: "expense" | "income";
  category_id: string | null;
  canonical_merchant: string | null;
  support_ratio: number | null;
};
export type PersonRef = { id: string; name: string; normalized_name: string; kind: PersonKind; alias_of: string | null };
export type OwnerLabel = { category_id: string; n: number; total: number };

export type Ctx = {
  now: string; // YYYY-MM-DD; rows older than 30 days before it never go to the Inbox
  categories: CategoryRef[];
  rules: RuleRef[];
  memory: MemoryRef[];
  people: PersonRef[];
  ownerLabels: Map<string, OwnerLabel>; // merchant_key -> your majority label (see deriveOwnerLabels)
  ownCardSuffixes: string[];
  lastSalaryOn?: string | null; // date of the newest salary already saved; a second pay within 20 days is extra income
};

type KnowledgeMerchant = {
  key: string;
  class: string;
  category: string | null;
  parent: string | null;
  clean_name: string | null;
  confidence: number;
  reason: string;
};
type KnowledgePattern = { regex: string; category: string; parent: string | null; clean_name: string | null; reason: string; confidence?: number };
type RuleAudit = { pattern: string; suggested: string };
type Knowledge = { merchants: KnowledgeMerchant[]; patterns: KnowledgePattern[]; mcc: Record<string, string | null>; rule_audit: RuleAudit[] };

export const knowledge: Knowledge = knowledgeJson;

const REVIEW_BELOW = 0.7;
const SALARY_GAP_DAYS = 20;
const INBOX_DAYS = 30;
const DAY_MS = 86_400_000;
const GIRLFRIEND = "girlfriend";

const knowledgeByKey = new Map(knowledge.merchants.map((m) => [m.key, m]));
const knowledgePatterns = knowledge.patterns.map((p) => ({ rx: new RegExp(p.regex), p }));

const auditByKey = new Map(knowledge.rule_audit.map((a) => [a.pattern, a.suggested]));

/** Payment rails (Klarna, Zettle, SumUp) are blocked keys: the merchant is the part after the rail's "*". */
export const merchantKey = (raw: string): string => {
  const key = normalizeMerchantContext({ kind: "expense", name: raw });
  const audit = auditByKey.get(key);
  const after = raw.slice(raw.indexOf("*") + 1);
  if (audit === undefined || parseAuditSuggestion(audit) || !raw.includes("*") || !after.trim()) return key;
  return normalizeMerchantContext({ kind: "expense", name: after }) || key;
};

// Lunar names a transfer "Overførsel <name>"; MobilePay and MP are already stripped by merchantKey.
const TRANSFER_PREFIX = "overforsel ";

/** Keys a person's transfers carry: the name folded like a merchant key (søren = soren), bare or after the transfer prefix. */
export const personKeys = (p: { normalized_name: string }): string[] => {
  const key = merchantKey(p.normalized_name);
  return key ? [key, TRANSFER_PREFIX + key] : [];
};

/** Canonical person (alias_of followed) for a merchant key, matched as personKeys builds them. */
export const personMatcher = <P extends { id: string; normalized_name: string; alias_of: string | null }>(people: readonly P[]): ((key: string | null) => P | undefined) => {
  const byId = new Map(people.map((p) => [p.id, p]));
  const byKey = new Map<string, P>();
  for (const p of people) {
    const key = merchantKey(p.normalized_name);
    if (key) byKey.set(key, p.alias_of ? byId.get(p.alias_of) ?? p : p);
  }
  return (key) => (key ? byKey.get(key) ?? (key.startsWith(TRANSFER_PREFIX) ? byKey.get(key.slice(TRANSFER_PREFIX.length)) : undefined) : undefined);
};

/** First day whose unsure rows still go to the Inbox. */
export const inboxFrom = (now: string): string => new Date(Date.parse(now) - INBOX_DAYS * DAY_MS).toISOString().slice(0, 10);

/** What a categorized row does to the budget: money in to a non-income category is a refund; Transfers are not spending. */
export const movementFor = (cats: readonly CategoryRef[], categoryId: string | null, amountMinor: number): Movement => {
  const c = categoryId ? cats.find((x) => x.id === categoryId) : undefined;
  const parent = c?.parent_id ? cats.find((x) => x.id === c.parent_id) : c;
  const top = parent?.name.trim().toLowerCase() ?? "";
  if (top === "transfers") return c?.name.trim().toLowerCase() === "mobilepay" ? "person" : "moved";
  if (amountMinor < 0) return "spend";
  return top === "income" ? "income" : "refund";
};

const titleCase = (value: string): string => value.replace(/\b[a-z]/g, (c) => c.toUpperCase());
const dayDiff = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
const suffixOf = (text: string, rx: RegExp): string | null => text.match(rx)?.[1] ?? null;

/** Category id by name; `parent` picks the child under that parent (Travel > Food), else top level first. */
export const findCategory = (cats: readonly CategoryRef[], name: string, parent: string | null = null): string | null => {
  const lower = name.trim().toLowerCase();
  const byName = cats.filter((c) => c.name.trim().toLowerCase() === lower);
  if (parent) {
    const parentLower = parent.trim().toLowerCase();
    const parentIds = new Set(cats.filter((c) => c.name.trim().toLowerCase() === parentLower && !c.parent_id).map((c) => c.id));
    return byName.find((c) => c.parent_id && parentIds.has(c.parent_id))?.id ?? null;
  }
  return byName.find((c) => !c.parent_id)?.id ?? byName[0]?.id ?? null;
};

/** "Travel>Food via pattern" -> { parent: Travel, name: Food }; null when the fix blocks the key. */
export const parseAuditSuggestion = (suggested: string): { name: string; parent: string | null } | null => {
  const s = suggested.trim();
  if (!s || s.includes("block") || s.includes("null")) return null;
  const parts = (s.split(" via ")[0] ?? "").split(">").map((x) => x.trim());
  const name = parts[parts.length - 1] ?? "";
  return { name, parent: parts.length > 1 ? parts[0] ?? null : null };
};

/** Your majority category per merchant from your hand-entered rows. Girlfriend labels are context, never a merchant fact. */
export const deriveOwnerLabels = (
  rows: readonly { merchant_key: string; category_id: string }[],
  categories: readonly CategoryRef[],
): Map<string, OwnerLabel> => {
  const counts = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!r.merchant_key) continue;
    const byCat = counts.get(r.merchant_key) ?? new Map<string, number>();
    byCat.set(r.category_id, (byCat.get(r.category_id) ?? 0) + 1);
    counts.set(r.merchant_key, byCat);
  }
  const girlfriend = new Set(categories.filter((c) => c.name.trim().toLowerCase() === GIRLFRIEND).map((c) => c.id));
  const out = new Map<string, OwnerLabel>();
  for (const [key, byCat] of counts) {
    let best: [string, number] | null = null;
    let total = 0;
    for (const [cat, n] of byCat) {
      total += n;
      if (!best || n > best[1]) best = [cat, n];
    }
    if (!best || total < 2 || best[1] / total < 0.7 || girlfriend.has(best[0])) continue;
    out.set(key, { category_id: best[0], n: best[1], total });
  }
  return out;
};

type Draft = {
  category_id: string | null;
  movement: Movement;
  reason: string;
  reason_source: ReasonSource;
  confidence: number;
  name?: string | null;
  needs_review?: boolean;
  is_salary?: boolean;
  is_shared_topup?: boolean;
  shared_participant?: "me" | "gf" | null;
  person?: PersonRef | null;
  merchant?: boolean; // a shop or service: positive money from it is a refund
};

export function classify(ctx: Ctx, txs: BankTx[]): Map<string, Label> {
  const cats = ctx.categories;
  const cat = (name: string, parent: string | null = null): string | null => findCategory(cats, name, parent);
  const transferId = cat("Transfer", "Transfers");
  const mobilePayId = cat("MobilePay", "Transfers");
  const refundId = cat("Refund", "Income");
  const incomeParent = cats.find((c) => !c.parent_id && c.name.trim().toLowerCase() === "income")?.id ?? null;
  // A Transfers category (MobilePay "Overførsel <name>") is money between people: money in from it is no refund.
  const isShop = (id: string | null): boolean => movementFor(cats, id, -1) === "spend";
  const isIncomeCat = (id: string | null): boolean => Boolean(id && (id === incomeParent || cats.find((c) => c.id === id)?.parent_id === incomeParent));

  // People: canonical row per person (alias_of followed), matched by name folded like a merchant key.
  const byId = new Map(ctx.people.map((p) => [p.id, p]));
  const canonical = (p: PersonRef): PersonRef => (p.alias_of ? byId.get(p.alias_of) ?? p : p);
  const personOf = personMatcher(ctx.people);
  let lastSalary = ctx.lastSalaryOn ?? null;
  const namesOf = (kind: PersonKind): string[] =>
    ctx.people.filter((p) => canonical(p).kind === kind).map((p) => normalizeAsciiText(p.normalized_name)).filter(Boolean);
  const selfNames = namesOf("self");
  const partnerNames = namesOf("partner");
  const familyNames = namesOf("family");
  const has = (text: string, names: readonly string[]): boolean => names.some((n) => ` ${text} `.includes(` ${n} `));
  const ownCards = new Set(ctx.ownCardSuffixes);

  // Rules and memory with the 21 audit fixes applied: payment rails (Zettle, SumUp, Klarna) are not merchants.
  const audit = new Map(knowledge.rule_audit.map((a) => [a.pattern, parseAuditSuggestion(a.suggested)]));
  const fixed = (key: string, categoryId: string | null): string | null | undefined => {
    if (!audit.has(key)) return categoryId;
    const s = audit.get(key);
    return s ? cat(s.name, s.parent) ?? categoryId : undefined; // undefined = blocked
  };
  const pickByKind = <T extends { kind: "expense" | "income" }>(rows: T[], kind: "expense" | "income"): T | undefined =>
    rows.find((r) => r.kind === kind) ?? rows[0];
  // A blocked rule silences that key in rules and memory alike (as the old ranker did).
  const blocked = new Set(ctx.rules.filter((r) => r.is_blocked).map((r) => r.pattern));
  const rulesByKey = new Map<string, RuleRef[]>();
  for (const r of ctx.rules) if (!blocked.has(r.pattern)) rulesByKey.set(r.pattern, [...(rulesByKey.get(r.pattern) ?? []), r]);
  const memByKey = new Map<string, MemoryRef[]>();
  for (const m of ctx.memory) if (!blocked.has(m.normalized_merchant)) memByKey.set(m.normalized_merchant, [...(memByKey.get(m.normalized_merchant) ?? []), m]);

  // Pass 1: pair own money moves (Lunar "Revolut**NNNN" out <-> Revolut TOPUP in, same amount, 0..3 days).
  // The other party: payee when money goes out, payer when it comes in. A refund's debtor is the card holder, so use the shop.
  const text = (t: BankTx): string =>
    ((t.amount_minor < 0 || t.bank_code === "CARD_REFUND" ? t.creditor_name : t.debtor_name) || t.remittance || t.bank_code || "").trim();
  const lunarToRevolut = txs.filter((t) => t.bank === "lunar" && t.amount_minor < 0 && /revolut/i.test(text(t)));
  const topups = txs.filter((t) => t.bank_code === "TOPUP" && t.amount_minor > 0);
  const pairedTopup = new Set<string>();
  const pairDest = new Map<string, AccountRole>();
  const suffixDest = new Map<string, Map<AccountRole, number>>();
  for (const o of lunarToRevolut) {
    let best: BankTx | null = null;
    for (const u of topups) {
      if (pairedTopup.has(u.id) || u.amount_minor !== -o.amount_minor) continue;
      const d = dayDiff(o.booking_date, u.booking_date);
      if (d < 0 || d > 3) continue;
      if (!best || d < dayDiff(o.booking_date, best.booking_date)) best = u;
    }
    if (!best) continue;
    pairedTopup.add(best.id);
    pairDest.set(o.id, best.account_role);
    const sfx = suffixOf(text(o), /\*\*(\d{4})/);
    if (sfx) {
      const dest = suffixDest.get(sfx) ?? new Map<AccountRole, number>();
      dest.set(best.account_role, (dest.get(best.account_role) ?? 0) + 1);
      suffixDest.set(sfx, dest);
    }
  }
  const learnedDest = (sfx: string | null): AccountRole | null => {
    const dest = sfx ? suffixDest.get(sfx) : undefined;
    if (!dest) return null;
    return [...dest.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };

  const rung = (t: BankTx, n: string, nr: string | null): Draft => {
    const raw = text(t);
    const low = normalizeAsciiText(raw);
    const lowRem = normalizeAsciiText(t.remittance ?? "");
    const isJoint = t.account_role === "joint";
    const jointName = (s: string): boolean => has(s, selfNames) && has(s, partnerNames);

    // 0 noise
    if (low.includes("temporary hold") || t.amount_minor === 0) {
      return { category_id: null, movement: "ignore", confidence: 0.99, reason_source: "rule", reason: "Card authorisation hold, not a payment" };
    }

    // 1 own money moves and joint top-ups
    if (t.bank_code === "TOPUP" && t.amount_minor > 0) {
      const sfx = suffixOf(raw, /\*(\d{4})/);
      const paired = pairedTopup.has(t.id);
      if (isJoint) {
        const mine = Boolean(sfx && ownCards.has(sfx)) || paired;
        return {
          category_id: transferId, movement: "topup", confidence: paired ? 0.97 : 0.85, reason_source: "transfer",
          is_shared_topup: true, shared_participant: mine ? "me" : "gf", name: mine ? "Your top-up" : "Partner's top-up",
          reason: (mine ? "Your top-up into the joint account" : "Partner's top-up into the joint account") + (sfx ? ` (card *${sfx})` : ""),
        };
      }
      return { category_id: transferId, movement: "moved", confidence: 0.97, reason_source: "transfer", name: "Revolut top-up", reason: "Top-up from your card into Revolut" };
    }
    if (t.bank === "lunar" && /revolut/.test(low)) {
      const dest = pairDest.get(t.id) ?? learnedDest(suffixOf(raw, /\*\*(\d{4})/));
      if (dest === "joint") {
        return { category_id: transferId, movement: "topup", confidence: 0.95, reason_source: "transfer", shared_participant: "me", name: "Joint top-up", reason: "You topped up the joint account from Lunar" };
      }
      return { category_id: transferId, movement: "moved", confidence: dest ? 0.95 : 0.9, reason_source: "transfer", name: "Moved to Revolut", reason: "Moved from Lunar to your Revolut" + (dest ? "" : " (card match learned)") };
    }
    // Refunds and rewards carry the card holder's name; they never reach the name rungs.
    const refundLike = t.bank_code === "CARD_REFUND" || t.bank_code === "REWARD";
    // Own-name text means an own move only on transfers (Revolut TRANSFER, Lunar has no bank code).
    const transferLike = t.bank_code === "TRANSFER" || (t.bank === "lunar" && !t.bank_code);
    if (t.bank_code === "TRANSFER" && !isJoint && t.amount_minor < 0 && (jointName(low) || jointName(lowRem))) {
      return { category_id: transferId, movement: "topup", confidence: 0.98, reason_source: "transfer", shared_participant: "me", name: "Joint top-up", reason: "You moved money into the joint account" };
    }
    if (isJoint && t.amount_minor > 0 && t.bank_code === "TRANSFER" && has(low, selfNames)) {
      return {
        category_id: transferId, movement: "topup", confidence: 0.98, reason_source: "transfer", is_shared_topup: true, shared_participant: "me",
        name: "Your top-up", reason: "You moved money into the joint account",
      };
    }
    if ((transferLike && has(low, selfNames) && !has(low, familyNames)) || /^to (dkk|eur)\b/.test(low)) {
      return { category_id: transferId, movement: "moved", confidence: 0.95, reason_source: "transfer", name: "Own transfer", reason: "Between your own accounts or currency pockets" };
    }

    // 2 income
    if (/lonoverf/.test(n) || /lonoverf/.test(low)) {
      // A bonus or holiday pay days after payday must not end the salary cycle.
      const isSalary = t.amount_minor > 0 && (lastSalary === null || dayDiff(lastSalary, t.booking_date) >= SALARY_GAP_DAYS);
      if (isSalary) lastSalary = t.booking_date;
      return {
        category_id: cat("Salary", "Income"), movement: "income", confidence: 0.99, reason_source: "salary", is_salary: isSalary, name: "Salary",
        reason: isSalary || t.amount_minor < 0 ? "Salary transfer (LØNOVERFØRSEL)" : "Extra pay (LØNOVERFØRSEL) less than 20 days after salary",
      };
    }
    if ((n === "su" || nr === "su") && t.amount_minor > 0) {
      return { category_id: cat("Benefits", "Income"), movement: "income", confidence: 0.98, reason_source: "salary", name: "SU", reason: "SU student grant" };
    }

    // 3 people (by kind; family asks every time)
    const person = refundLike ? null : personOf(n) ?? personOf(nr) ?? null;
    if (person || (!refundLike && t.mcc === "4829")) {
      const dir = t.amount_minor < 0 ? "to" : "from";
      const who = person ? titleCase(person.name.toLowerCase()) : titleCase(n);
      if (person?.kind === "ignore") return { category_id: mobilePayId, movement: "ignore", confidence: 0.9, reason_source: "person", person, name: who, reason: `Money ${dir} ${who}: set to ignore` };
      if (person?.kind === "self") return { category_id: transferId, movement: "moved", confidence: 0.95, reason_source: "person", person, name: "Own transfer", reason: "Between your own accounts" };
      if (person?.kind === "family") {
        return { category_id: mobilePayId, movement: "person", confidence: 0.9, reason_source: "person", person, name: who, reason: `Money ${dir} family; add it to a debt on People if it is one` };
      }
      if (person?.kind === "partner") return { category_id: mobilePayId, movement: "person", confidence: 0.9, reason_source: "person", person, name: who, reason: `MobilePay ${dir} ${who}` };
      return { category_id: mobilePayId, movement: "person", confidence: 0.85, reason_source: "person", person, name: who, reason: `Money ${dir} ${who}` };
    }

    const keys = [n, nr].filter((k): k is string => Boolean(k));
    const kind = t.amount_minor < 0 ? "expense" : "income";

    // 4 your own labels (majority of what you chose by hand)
    for (const k of keys) {
      const o = ctx.ownerLabels.get(k);
      if (!o) continue;
      const catName = cats.find((c) => c.id === o.category_id)?.name ?? "";
      return {
        category_id: o.category_id, movement: "spend", merchant: true, confidence: Math.min(0.97, 0.75 + 0.05 * o.n), reason_source: "you",
        reason: `You labelled ${titleCase(k)} as ${catName} ${o.n}×`,
      };
    }

    // 5 rules, 6 memory
    for (const k of keys) {
      const r = pickByKind(rulesByKey.get(k) ?? [], kind);
      const id = r ? fixed(k, r.category_id) : undefined;
      if (r && id) return { category_id: id, movement: "spend", merchant: true, confidence: 0.9, reason_source: "rule", name: r.canonical_merchant, reason: `Your rule: ${titleCase(r.canonical_merchant || k)}` };
    }
    for (const k of keys) {
      const m = pickByKind(memByKey.get(k) ?? [], kind);
      const id = m ? fixed(k, m.category_id) : undefined;
      if (m && id) {
        return {
          category_id: id, movement: "spend", merchant: true, confidence: Math.min(0.95, m.support_ratio ?? 0.8), reason_source: "memory", name: m.canonical_merchant,
          reason: `Seen before as ${titleCase(m.canonical_merchant || k)}`,
        };
      }
    }

    // 7 knowledge: merchant table, then chain patterns
    const km = knowledgeByKey.get(n) ?? (nr ? knowledgeByKey.get(nr) : undefined);
    if (km?.class === "own") return { category_id: transferId, movement: "moved", confidence: km.confidence, reason_source: "transfer", name: km.clean_name, reason: km.reason };
    if (km?.class === "ignore") return { category_id: null, movement: "ignore", confidence: km.confidence, reason_source: "rule", name: km.clean_name, reason: km.reason };
    if (km?.class === "refund") return { category_id: refundId, movement: "refund", confidence: km.confidence, reason_source: "rule", name: km.clean_name, reason: km.reason };
    if (km?.category) {
      const id = cat(km.category, km.parent);
      return { category_id: id, movement: "spend", merchant: km.class !== "fee" && isShop(id), confidence: km.confidence, reason_source: "rule", name: km.clean_name, reason: km.reason };
    }
    for (const { rx, p } of knowledgePatterns) {
      if (!keys.some((k) => rx.test(k))) continue;
      const id = cat(p.category, p.parent);
      return { category_id: id, movement: "spend", merchant: isShop(id), confidence: p.confidence ?? 0.88, reason_source: "rule", name: p.clean_name, reason: p.reason };
    }

    // 8 bank merchant code
    const mccCat = t.mcc ? knowledge.mcc[t.mcc] : undefined;
    if (t.mcc && mccCat) {
      return { category_id: cat(mccCat), movement: "spend", merchant: true, confidence: 0.8, reason_source: "mcc", reason: `Bank merchant code ${t.mcc}: ${mccCat.toLowerCase()}` };
    }
    if (t.bank_code === "CARD_REFUND" || t.bank_code === "REWARD") {
      return { category_id: refundId, movement: "refund", confidence: 0.85, reason_source: "rule", reason: "Refund or reward from the bank" };
    }
    return { category_id: null, movement: t.amount_minor < 0 ? "spend" : "income", confidence: 0, reason_source: "ai", needs_review: true, reason: "Needs AI or you" };
  };

  const reviewFrom = inboxFrom(ctx.now);
  const out = new Map<string, Label>();
  for (const t of txs) {
    const raw = text(t);
    const n = merchantKey(raw);
    const nr = t.remittance ? merchantKey(t.remittance) : null;
    const d = rung(t, n, nr);

    let { category_id, movement, reason } = d;
    // Money coming back from a shop is a refund, whatever the shop's usual category.
    if (d.merchant && t.amount_minor > 0 && !isIncomeCat(category_id)) {
      category_id = refundId;
      movement = "refund";
      reason = `Money back from ${d.name || titleCase(n)}`;
    } else if (movement === "spend") {
      movement = movementFor(cats, category_id, t.amount_minor);
    }

    const isJoint = t.account_role === "joint";
    const payer = t.amount_minor < 0 && t.debtor_name ? normalizeAsciiText(t.debtor_name) : "";
    const paidBy = !isJoint ? (t.amount_minor < 0 ? "me" : null) : has(payer, selfNames) ? "me" : has(payer, partnerNames) ? "partner" : null;
    // Money moved to people or own accounts never asks (owner rule); it counts as moved unless added to a debt.
    const review = movement !== "person" && movement !== "moved" &&
      ((d.needs_review ?? false) || (movement !== "ignore" && d.confidence < REVIEW_BELOW));

    out.set(t.id, {
      category_id,
      movement,
      shared: isJoint && !d.is_shared_topup, // transactions_topup_shape: a top-up row is never itself shared spending
      paid_by: paidBy,
      is_salary: d.is_salary ?? false,
      is_shared_topup: d.is_shared_topup ?? false,
      shared_participant: d.shared_participant ?? null,
      counterparty_person_id: d.person?.id ?? null,
      merchant_key: n,
      name: d.name || (t.bank === "lunar" && t.remittance ? t.remittance.trim() : titleCase(n || raw.toLowerCase())),
      reason,
      reason_source: d.reason_source,
      confidence: Math.round(d.confidence * 100) / 100,
      // Inbox policy: only the last 30 days ask; older rows keep the best guess and its reason.
      needs_review: review && t.booking_date >= reviewFrom,
    });
  }
  return out;
}

// Prints the SQL that sets people kinds, name aliases, opening balances (from loans) and the owner's card suffixes.
// The facts (names, cards) come from a private JSON file; this script holds none. Output has names: keep it in the scratchpad.
// Usage: deno run --allow-read --allow-write scripts/classify/people-seed.ts <sp-dir> <kit-dir> <facts.json>
//   <sp-dir>/prod/{transfer_people,loans,profiles}.json  production exports
//   <kit-dir>/knowledge.json                             labeling kit (person entries)
//   <facts.json> { self[], partner[], family[], ignore[], spellings: string[][], own_card_suffixes[], loans: {loan name: person name | null} }
// Writes <sp-dir>/people-seed.sql; prints counts only. The lead runs the SQL on production after the owner's go.
import type { PersonKind } from "../../supabase/functions/_shared/classify/engine.ts";

export type Facts = {
  self: string[];
  partner: string[];
  family: string[];
  ignore: string[];
  spellings: string[][];
  own_card_suffixes: string[];
  loans: Record<string, string | null>;
};
export type ExistingPerson = { id: string; name: string; normalized_name: string };
export type Loan = { name: string; remaining_minor: number; status: string };
export type SeedPerson = {
  id: string | null; // null = new row
  name: string;
  normalized_name: string;
  kind: PersonKind;
  opening_balance_minor: number;
  alias_of_name: string | null; // normalized_name of the canonical row
};

const PREFIX = /^overforsel /; // Lunar "Overførsel MobilePay <name>" keys

const tokens = (name: string): string[] => name.replace(PREFIX, "").trim().split(/\s+/);
const spellingOf = (name: string, facts: Facts): string => {
  const bare = name.replace(PREFIX, "");
  for (const group of facts.spellings) if (group.includes(bare)) return group[group.length - 1] ?? bare;
  return bare;
};

/** Same person when one name is the other cut short ("jon sm" / "jon smith", "ana bel" / "ana belo test"). */
export const samePerson = (a: string, b: string, facts: Facts): boolean => {
  const [x, y] = [tokens(spellingOf(a, facts)), tokens(spellingOf(b, facts))];
  const [short, long] = x.join(" ").length <= y.join(" ").length ? [x, y] : [y, x];
  if (short.length === 0 || short.length > long.length) return false;
  const last = short.length - 1;
  for (let i = 0; i < last; i += 1) if (short[i] !== long[i]) return false;
  return (long[last] ?? "").startsWith(short[last] ?? "");
};

const titleCase = (value: string): string => value.replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function buildPeopleSeed(existing: ExistingPerson[], knowledgePeople: string[], facts: Facts, loans: Loan[]): SeedPerson[] {
  const all: SeedPerson[] = existing.map((p) => ({ id: p.id, name: p.name, normalized_name: p.normalized_name, kind: "settle_up", opening_balance_minor: 0, alias_of_name: null }));
  const known = (n: string): boolean => all.some((p) => p.normalized_name === n);
  for (const key of knowledgePeople) {
    if (!known(key)) all.push({ id: null, name: titleCase(key.replace(PREFIX, "")), normalized_name: key, kind: "settle_up", opening_balance_minor: 0, alias_of_name: null });
  }
  // Facts names nobody wrote yet (the owner's own name) become rows so the classifier knows them.
  for (const n of [...facts.self, ...facts.partner]) {
    if (!all.some((p) => samePerson(p.normalized_name, n, facts))) {
      all.push({ id: null, name: titleCase(n), normalized_name: n, kind: "settle_up", opening_balance_minor: 0, alias_of_name: null });
    }
  }

  // Group variants; the canonical row is an existing one when possible, then the longest name.
  const groups: SeedPerson[][] = [];
  for (const p of all) {
    const g = groups.find((members) => members.some((m) => samePerson(m.normalized_name, p.normalized_name, facts)));
    if (g) g.push(p);
    else groups.push([p]);
  }
  const kindOf = (n: string): PersonKind => {
    const lists: [PersonKind, string[]][] = [["self", facts.self], ["partner", facts.partner], ["family", facts.family], ["ignore", facts.ignore]];
    for (const [kind, names] of lists) if (names.some((f) => samePerson(f, n, facts))) return kind;
    return "settle_up";
  };
  for (const g of groups) {
    const canonical = [...g].sort((a, b) => Number(b.id !== null) - Number(a.id !== null) || b.normalized_name.length - a.normalized_name.length)[0];
    if (!canonical) continue;
    canonical.kind = kindOf(canonical.normalized_name);
    for (const p of g) if (p !== canonical) p.alias_of_name = canonical.normalized_name;
  }

  // Loans become opening balances on the canonical row: an open loan is money the owner owes (negative).
  for (const loan of loans) {
    const person = facts.loans[loan.name];
    if (!person || loan.remaining_minor === 0) continue;
    const target = all.find((p) => p.alias_of_name === null && samePerson(p.normalized_name, person, facts));
    if (!target) throw new Error("loan person not found in transfer_people");
    target.opening_balance_minor -= loan.remaining_minor;
  }
  return all;
}

const q = (s: string): string => `'${s.replace(/'/g, "''")}'`;

export function seedSql(userId: string, people: SeedPerson[], facts: Facts): string {
  const lines = ["begin;"];
  for (const p of people.filter((x) => x.id === null)) {
    lines.push(`insert into public.transfer_people (user_id, name, normalized_name) values (${q(userId)}, ${q(p.name)}, ${q(p.normalized_name)}) on conflict (user_id, normalized_name) do nothing;`);
  }
  for (const p of people) {
    const alias = p.alias_of_name
      ? `(select id from public.transfer_people where user_id = ${q(userId)} and normalized_name = ${q(p.alias_of_name)})`
      : "null";
    // Kind and balance live on the canonical row; variants keep the defaults and point at it.
    const kind = p.alias_of_name ? "settle_up" : p.kind;
    const opening = p.alias_of_name ? 0 : p.opening_balance_minor;
    lines.push(`update public.transfer_people set kind = ${q(kind)}, opening_balance_minor = ${opening}, alias_of = ${alias} where user_id = ${q(userId)} and normalized_name = ${q(p.normalized_name)};`);
  }
  lines.push(`update public.profiles set own_card_suffixes = array[${facts.own_card_suffixes.map(q).join(", ")}]::text[] where user_id = ${q(userId)};`);
  lines.push("commit;");
  return lines.join("\n") + "\n";
}

if (import.meta.main) {
  const [sp, kit, factsPath] = Deno.args;
  if (!sp || !kit || !factsPath) throw new Error("usage: people-seed.ts <sp-dir> <kit-dir> <facts.json>");
  const read = async <T>(path: string): Promise<T> => JSON.parse(await Deno.readTextFile(path)) as T;
  const facts = await read<Facts>(factsPath);
  const existing = await read<ExistingPerson[]>(`${sp}/prod/transfer_people.json`);
  const loans = await read<Loan[]>(`${sp}/prod/loans.json`);
  const profiles = await read<{ user_id: string }[]>(`${sp}/prod/profiles.json`);
  const kitKnowledge = await read<{ merchants: { key: string; class: string }[] }>(`${kit}/knowledge.json`);
  const userId = profiles[0]?.user_id;
  if (!userId) throw new Error("no profile in export");

  const people = buildPeopleSeed(existing, kitKnowledge.merchants.filter((m) => m.class === "person").map((m) => m.key), facts, loans);
  await Deno.writeTextFile(`${sp}/people-seed.sql`, seedSql(userId, people, facts));
  const count = (f: (p: SeedPerson) => boolean): number => people.filter(f).length;
  console.log(`people: ${people.length} (new ${count((p) => p.id === null)}, aliases ${count((p) => p.alias_of_name !== null)})`);
  for (const kind of ["self", "partner", "family", "settle_up", "ignore"]) console.log(`  ${kind}: ${count((p) => p.alias_of_name === null && p.kind === kind)}`);
  console.log(`opening balances set: ${count((p) => p.opening_balance_minor !== 0)} | card suffixes: ${facts.own_card_suffixes.length}`);
  console.log(`written: ${sp}/people-seed.sql`);
}

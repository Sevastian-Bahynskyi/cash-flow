// Prints the SQL that writes the labeling kit's rule_audit fixes into production rules and memory.
// The classifier already applies them at runtime; this makes the stored data agree. Never deletes a row:
// payment rails (blocked keys) get an is_blocked rule, which the ranker and the classifier both honour.
// Usage: deno run --allow-read --allow-write scripts/classify/rule-fixes.ts <sp-dir> <kit-dir>
//   <sp-dir>/prod/{categories,merchant_category_rules,merchant_category_memory,profiles}.json   production exports
//   <kit-dir>/knowledge.json   the full kit (some audit keys hold names, so the output stays in <sp-dir>)
// Writes <sp-dir>/rule-fixes.sql; prints counts only. The lead runs it on production after the owner's go.
import { type CategoryRef, findCategory, parseAuditSuggestion } from "../../supabase/functions/_shared/classify/engine.ts";

type Rule = { id: string; pattern: string; kind: string; category_id: string | null; is_blocked: boolean };
type Memory = { id: string; normalized_merchant: string; category_id: string };
type Audit = { pattern: string; suggested: string };

const q = (s: string): string => `'${s.replace(/'/g, "''")}'`;

export function ruleFixesSql(userId: string, audit: Audit[], cats: CategoryRef[], rules: Rule[], memory: Memory[]): { sql: string; counts: Record<string, number> } {
  const counts = { rules_updated: 0, memory_updated: 0, blocked_rules_set: 0, blocked_rules_added: 0, no_row: 0, unknown_category: 0 };
  const lines = ["begin;"];
  for (const a of audit) {
    const fix = parseAuditSuggestion(a.suggested);
    const hitRules = rules.filter((r) => r.pattern === a.pattern);
    const hitMemory = memory.filter((m) => m.normalized_merchant === a.pattern);
    if (!fix) {
      for (const r of hitRules) {
        lines.push(`update public.merchant_category_rules set is_blocked = true, updated_at = now() where id = ${q(r.id)};`);
        counts.blocked_rules_set += 1;
      }
      if (!hitRules.some((r) => r.kind === "expense")) {
        lines.push(
          `insert into public.merchant_category_rules (user_id, match_target, match_type, pattern, kind, is_blocked, source, notes) values (${q(userId)}, 'normalized_merchant', 'exact', ${q(a.pattern)}, 'expense', true, 'manual', 'payment rail, not a merchant') on conflict do nothing;`,
        );
        counts.blocked_rules_added += 1;
      }
      continue;
    }
    const categoryId = findCategory(cats, fix.name, fix.parent);
    if (!categoryId) {
      lines.push(`-- skipped: no category for audit key (${fix.parent ? `${fix.parent} > ` : ""}${fix.name})`);
      counts.unknown_category += 1;
      continue;
    }
    if (hitRules.length === 0 && hitMemory.length === 0) counts.no_row += 1;
    for (const r of hitRules) {
      if (r.category_id === categoryId) continue;
      lines.push(`update public.merchant_category_rules set category_id = ${q(categoryId)}, updated_at = now() where id = ${q(r.id)};`);
      counts.rules_updated += 1;
    }
    for (const m of hitMemory) {
      if (m.category_id === categoryId) continue;
      lines.push(`update public.merchant_category_memory set category_id = ${q(categoryId)}, updated_at = now() where id = ${q(m.id)};`);
      counts.memory_updated += 1;
    }
  }
  lines.push("commit;");
  return { sql: lines.join("\n") + "\n", counts };
}

if (import.meta.main) {
  const [sp, kit] = Deno.args;
  if (!sp || !kit) throw new Error("usage: rule-fixes.ts <sp-dir> <kit-dir>");
  const read = async <T>(path: string): Promise<T> => JSON.parse(await Deno.readTextFile(path)) as T;
  const userId = (await read<{ user_id: string }[]>(`${sp}/prod/profiles.json`))[0]?.user_id;
  if (!userId) throw new Error("no profile in export");
  const { sql, counts } = ruleFixesSql(
    userId,
    (await read<{ rule_audit: Audit[] }>(`${kit}/knowledge.json`)).rule_audit,
    await read<CategoryRef[]>(`${sp}/prod/categories.json`),
    await read<Rule[]>(`${sp}/prod/merchant_category_rules.json`),
    await read<Memory[]>(`${sp}/prod/merchant_category_memory.json`),
  );
  await Deno.writeTextFile(`${sp}/rule-fixes.sql`, sql);
  console.log(Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" | "));
  console.log(`written: ${sp}/rule-fixes.sql`);
}

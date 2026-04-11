import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  findMobilePayCategoryId,
  isMobilePayCategoryId,
  resolveHardcodedCategoryId,
  type Candidate,
  type TransactionKind,
} from "./categorization";

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

declare const console: {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

type HistoryItem = {
  name?: string;
  categoryId?: string;
  kind?: TransactionKind;
};

type BatchInputRow = {
  id?: string;
  name?: string;
  comment?: string | null;
  kind?: TransactionKind;
};

type Body = {
  name?: string;
  comment?: string | null;
  rows?: BatchInputRow[];
  candidates?: Candidate[];
  history?: HistoryItem[];
};

type SuggestResult = {
  categoryId: string | null;
  confidence: number;
};

type BatchSuggestResult = {
  id: string;
  categoryId: string;
  confidence: number;
};

type SuggestErrorBody = SuggestResult & {
  error?: string;
};

type BatchResponseBody = {
  results: BatchSuggestResult[];
  error?: string;
};

type GroqResponsePayload = {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
};

type NormalizedBatchRow = Required<Pick<BatchInputRow, "id" | "name" | "comment" | "kind">>;

const jsonSingle = (body: SuggestResult, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

const jsonBatch = (body: BatchResponseBody, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

const errorJsonSingle = (message: string, status: number): Response =>
  new Response(JSON.stringify({ categoryId: null, confidence: 0, error: message } satisfies SuggestErrorBody), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const normalizeLookupPattern = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[æÆ]/g, "ae")
    .replace(/[øØ]/g, "o")
    .replace(/[åÅ]/g, "a")
    .toLowerCase()
    .replace(/\bmobilepay\b/g, " ")
    .replace(/\bmob\s*pay\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/[0-9]+/g, "#")
    .replace(/\s+/g, " ")
    .trim();

const mentionMobilePay = (value: string): boolean => {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /mobilepay|mob\s*\.?\s*pay|\bmp\b/.test(normalized);
};

const invokeGroq = async ({
  key,
  prompt,
  maxTokens,
  model = "meta-llama/llama-4-scout-17b-16e-instruct",
  timeoutMs = 5200,
}: {
  key: string;
  prompt: string;
  maxTokens: number;
  model?: string;
  timeoutMs?: number;
}): Promise<{ text: string | null; degraded: boolean }> => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptTimeoutMs = attempt === 0 ? timeoutMs : Math.round(timeoutMs * 1.4);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: maxTokens,
          messages: [
            {
              role: "system",
              content: "Return strict JSON only.",
            },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(attemptTimeoutMs),
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        console.error("[suggest-category] Groq request failed.", {
          attempt: attempt + 1,
          status: response.status,
          statusText: response.statusText,
          body: responseText.slice(0, 400),
        });

        if (attempt === 0 && response.status >= 500) {
          await wait(120);
          continue;
        }

        return { text: null, degraded: true };
      }

      const payload = (await response.json()) as GroqResponsePayload;
      return {
        text: payload?.choices?.[0]?.message?.content ?? "",
        degraded: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[suggest-category] Unexpected Groq error.", {
        attempt: attempt + 1,
        message,
      });

      if (attempt === 0) {
        await wait(120);
        continue;
      }
    }
  }

  return { text: null, degraded: true };
};

const parseSingleResult = (text: string, candidates: readonly Candidate[]): SuggestResult => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        categoryId?: unknown;
        confidence?: unknown;
      };
      const categoryId =
        typeof parsed.categoryId === "string" && candidates.some((candidate) => candidate.id === parsed.categoryId)
          ? parsed.categoryId
          : null;
      const confidence =
        typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
          ? clamp(parsed.confidence)
          : 0;
      return { categoryId, confidence: categoryId ? confidence : 0 };
    } catch {
      // Fall through to regex parsing.
    }
  }

  const idMatch = text.match(/\[([0-9a-f-]{36})\]/i);
  const categoryId = idMatch?.[1] ?? null;
  if (!categoryId || !candidates.some((candidate) => candidate.id === categoryId)) {
    return { categoryId: null, confidence: 0 };
  }
  return { categoryId, confidence: 0.6 };
};

const parseBatchResults = (text: string, validCategoryIds: Set<string>): BatchSuggestResult[] => {
  const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }

  const rows =
    Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && "results" in raw && Array.isArray((raw as { results?: unknown }).results)
        ? (raw as { results: unknown[] }).results
        : [];

  const parsed: BatchSuggestResult[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const objectRow = row as Record<string, unknown>;
    const id = typeof objectRow.id === "string" ? objectRow.id : null;
    const categoryId =
      typeof objectRow.categoryId === "string" && validCategoryIds.has(objectRow.categoryId)
        ? objectRow.categoryId
        : null;
    if (!id || !categoryId) continue;

    parsed.push({
      id,
      categoryId,
      confidence:
        typeof objectRow.confidence === "number" && Number.isFinite(objectRow.confidence)
          ? clamp(objectRow.confidence)
          : 0.4,
    });
  }

  return parsed;
};

const chooseBestCategoryId = (counts: Map<string, number>): string | null => {
  let bestCategoryId: string | null = null;
  let bestCount = 0;

  for (const [categoryId, count] of counts) {
    if (count > bestCount) {
      bestCategoryId = categoryId;
      bestCount = count;
    }
  }

  return bestCategoryId;
};

const findHistoryMatchCategoryId = ({
  name,
  comment,
  kind,
  history,
  validCategoryIds,
}: {
  name: string;
  comment?: string | null;
  kind: TransactionKind;
  history: HistoryItem[];
  validCategoryIds: Set<string>;
}): string | null => {
  const query = normalizeLookupPattern([name, comment ?? ""].join(" "));
  if (query.length < 2) return null;

  const exactCounts = new Map<string, number>();
  const fuzzyCounts = new Map<string, number>();

  for (const row of history) {
    const categoryId = typeof row.categoryId === "string" ? row.categoryId : null;
    if (!categoryId || !validCategoryIds.has(categoryId)) continue;
    if (row.kind && row.kind !== kind) continue;

    const historyName = typeof row.name === "string" ? row.name : "";
    const historyPattern = normalizeLookupPattern(historyName);
    if (!historyPattern) continue;

    if (historyPattern === query) {
      exactCounts.set(categoryId, (exactCounts.get(categoryId) ?? 0) + 1);
    }
    if (historyPattern.includes(query) || query.includes(historyPattern)) {
      fuzzyCounts.set(categoryId, (fuzzyCounts.get(categoryId) ?? 0) + 1);
    }
  }

  return chooseBestCategoryId(exactCounts) ?? chooseBestCategoryId(fuzzyCounts);
};

const shouldRejectMobilePayProposal = ({
  name,
  comment,
  categoryId,
  confidence,
  candidates,
}: {
  name: string;
  comment?: string | null;
  categoryId: string | null;
  confidence: number;
  candidates: readonly Candidate[];
}): boolean => {
  if (!isMobilePayCategoryId(categoryId, candidates)) return false;

  const fullText = [name, comment ?? ""].join(" ").trim();
  if (!mentionMobilePay(fullText)) return true;

  return confidence < 0.7;
};

const acceptSuggestion = ({
  name,
  comment,
  kind,
  parsed,
  candidates,
  history,
}: {
  name: string;
  comment?: string | null;
  kind: TransactionKind;
  parsed: SuggestResult | null;
  candidates: readonly Candidate[];
  history: readonly HistoryItem[];
}): SuggestResult => {
  const hardcoded = resolveHardcodedCategoryId({ kind, name, comment, candidates });
  if (hardcoded) {
    return { categoryId: hardcoded.categoryId, confidence: hardcoded.confidence };
  }

  const validCategoryIds = new Set(candidates.map((candidate) => candidate.id));
  const historyMatchCategoryId = findHistoryMatchCategoryId({
    name,
    comment,
    kind,
    history: [...history],
    validCategoryIds,
  });

  if (
    parsed?.categoryId &&
    !shouldRejectMobilePayProposal({
      name,
      comment,
      categoryId: parsed.categoryId,
      confidence: parsed.confidence,
      candidates,
    }) &&
    (parsed.confidence >= 0.58 || historyMatchCategoryId === parsed.categoryId)
  ) {
    return {
      categoryId: parsed.categoryId,
      confidence: historyMatchCategoryId === parsed.categoryId ? Math.max(parsed.confidence, 0.78) : parsed.confidence,
    };
  }

  if (historyMatchCategoryId) {
    return { categoryId: historyMatchCategoryId, confidence: 0.72 };
  }

  return { categoryId: null, confidence: 0 };
};

const repairBatchResults = ({
  rows,
  parsedResults,
  candidates,
  history,
}: {
  rows: NormalizedBatchRow[];
  parsedResults: BatchSuggestResult[];
  candidates: readonly Candidate[];
  history: readonly HistoryItem[];
}): BatchSuggestResult[] => {
  const validCategoryIds = new Set(candidates.map((candidate) => candidate.id));
  const parsedById = new Map(parsedResults.map((result) => [result.id, result]));

  return rows
    .map((row): BatchSuggestResult | null => {
      const hardcoded = resolveHardcodedCategoryId({
        kind: row.kind,
        name: row.name,
        comment: row.comment,
        candidates,
      });
      if (hardcoded) {
        return {
          id: row.id,
          categoryId: hardcoded.categoryId,
          confidence: hardcoded.confidence,
        };
      }

      const parsed = parsedById.get(row.id);
      if (
        parsed &&
        validCategoryIds.has(parsed.categoryId) &&
        !shouldRejectMobilePayProposal({
          name: row.name,
          comment: row.comment,
          categoryId: parsed.categoryId,
          confidence: parsed.confidence,
          candidates,
        })
      ) {
        const historyMatchCategoryId = findHistoryMatchCategoryId({
          name: row.name,
          comment: row.comment,
          kind: row.kind,
          history: [...history],
          validCategoryIds,
        });
        if (parsed.confidence >= 0.58 || historyMatchCategoryId === parsed.categoryId) {
          return {
            id: row.id,
            categoryId: parsed.categoryId,
            confidence:
              historyMatchCategoryId === parsed.categoryId
                ? Math.max(parsed.confidence, 0.78)
                : parsed.confidence,
          };
        }
      }

      const historyMatchCategoryId = findHistoryMatchCategoryId({
        name: row.name,
        comment: row.comment,
        kind: row.kind,
        history: [...history],
        validCategoryIds,
      });
      if (!historyMatchCategoryId) return null;

      return {
        id: row.id,
        categoryId: historyMatchCategoryId,
        confidence: 0.72,
      };
    })
    .filter((row): row is BatchSuggestResult => Boolean(row));
};

const buildHistoryList = (history: readonly HistoryItem[], candidates: readonly Candidate[], limit: number): string =>
  history
    .map((item) => {
      const historyName = (item.name ?? "").trim();
      const categoryId = typeof item.categoryId === "string" ? item.categoryId : "";
      const match = candidates.find((candidate) => candidate.id === categoryId);
      if (!historyName || !match) return null;
      const kindLabel = item.kind ? ` (${item.kind})` : "";
      return `- ${historyName}${kindLabel} -> ${match.parent} / ${match.name} [${match.id}]`;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, limit)
    .join("\n");

const buildBatchPrompt = ({
  rows,
  candidates,
  history,
}: {
  rows: readonly NormalizedBatchRow[];
  candidates: readonly Candidate[];
  history: readonly HistoryItem[];
}): string => {
  const candidateList = candidates
    .map((candidate, index) => `${index + 1}. ${candidate.parent} / ${candidate.name} [${candidate.id}]`)
    .join("\n");
  const historyList = buildHistoryList(history, candidates, 24);
  const rowList = rows
    .map(
      (row, index) =>
        `${index + 1}. id=${row.id}; kind=${row.kind}; name=${row.name || "(empty)"}; comment=${row.comment || "(none)"}`,
    )
    .join("\n");
  const mobilePayId = findMobilePayCategoryId(candidates);

  return [
    "You categorize imported financial transactions.",
    'Return strict JSON only: {"results":[{"id":"row-id","categoryId":"uuid","confidence":0.0}]}',
    "Only include rows you can classify with reasonable confidence. Omit uncertain rows entirely.",
    "Use the merchant or service name as the primary clue. History is supporting context, not the only signal.",
    "Do not assign MobilePay just because a string contains MobilePay or Mob.Pay. MobilePay is only for actual peer-to-peer MobilePay transfers.",
    "If a clear merchant or brand is present, categorize the merchant, not the payment rail.",
    "Salary descriptors like LONOVERFORSEL or LONOVERFOERSEL belong to Income / Salary.",
    "Easy Park is parking. Oister is a phone provider. Apple.com/BILL is a merchant bill, not MobilePay. Banken Food Hall is Food / Restaurants. Monobank or Revolut transfers belong to Transfers / Transfer when available.",
    mobilePayId ? `MobilePay category id: ${mobilePayId}` : "MobilePay category id: (not available)",
    `Rows:\n${rowList}`,
    `Past categorized examples:\n${historyList || "(none)"}`,
    `Candidates:\n${candidateList}`,
  ].join("\n");
};

const buildBatchVerifierPrompt = ({
  rows,
  draftResults,
  candidates,
}: {
  rows: readonly NormalizedBatchRow[];
  draftResults: readonly BatchSuggestResult[];
  candidates: readonly Candidate[];
}): string => {
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const draftList = draftResults
    .map((result, index) => {
      const row = rows.find((item) => item.id === result.id);
      const category = candidateById.get(result.categoryId);
      if (!row || !category) return null;
      return `${index + 1}. id=${row.id}; kind=${row.kind}; name=${row.name}; comment=${row.comment || "(none)"}; proposed=${category.parent} / ${category.name} [${category.id}]; confidence=${result.confidence.toFixed(2)}`;
    })
    .filter((item): item is string => Boolean(item))
    .join("\n");

  return [
    "You are verifying draft category assignments for imported financial transactions.",
    'Return strict JSON only: {"results":[{"id":"row-id","categoryId":"uuid","confidence":0.0}]}',
    "Keep correct assignments, fix obvious mistakes, and omit any row that still looks uncertain.",
    "Be especially strict with MobilePay: keep it only for actual peer-to-peer MobilePay transfers, never for merchants or service bills that happened to be paid through MobilePay.",
    "Easy Park must be parking. Oister must be Household / Phone. Apple.com/BILL is not MobilePay. Banken Food Hall is Food / Restaurants. Monobank and Revolut transfers are Transfers / Transfer when available. Salary descriptors are Income / Salary.",
    `Draft assignments:\n${draftList || "(none)"}`,
  ].join("\n");
};

const buildSinglePrompt = ({
  name,
  comment,
  candidates,
  history,
}: {
  name: string;
  comment: string;
  candidates: readonly Candidate[];
  history: readonly HistoryItem[];
}): string => {
  const candidateList = candidates
    .map((candidate, index) => `${index + 1}. ${candidate.parent} / ${candidate.name} [${candidate.id}]`)
    .join("\n");
  const historyList = buildHistoryList(history, candidates, 12);
  const mobilePayId = findMobilePayCategoryId(candidates);

  return [
    "You categorize spending transactions.",
    'Return strict JSON only: {"categoryId":"uuid-or-null","confidence":0.0}',
    "Return null when the category is not clear enough.",
    "Use the merchant or service name as the primary clue. History is supporting context.",
    "Do not assign MobilePay just because the text contains MobilePay or Mob.Pay. MobilePay is only for actual peer-to-peer MobilePay transfers.",
    "If a clear merchant or brand is present, categorize the merchant, not the payment rail.",
    "Salary descriptors like LONOVERFORSEL or LONOVERFOERSEL belong to Income / Salary.",
    "Easy Park is parking. Oister is a phone provider. Apple.com/BILL is a merchant bill, not MobilePay. Banken Food Hall is Food / Restaurants. Monobank or Revolut transfers belong to Transfers / Transfer when available.",
    mobilePayId ? `MobilePay category id: ${mobilePayId}` : "MobilePay category id: (not available)",
    `Transaction name: ${name}`,
    `Comment: ${comment || "(none)"}`,
    `Past categorized examples:\n${historyList || "(none)"}`,
    `Candidates:\n${candidateList}`,
  ].join("\n");
};

const buildSingleVerifierPrompt = ({
  name,
  comment,
  draft,
  candidates,
}: {
  name: string;
  comment: string;
  draft: SuggestResult;
  candidates: readonly Candidate[];
}): string => {
  const category = draft.categoryId ? candidates.find((candidate) => candidate.id === draft.categoryId) ?? null : null;
  const proposedLabel = category ? `${category.parent} / ${category.name} [${category.id}]` : "null";

  return [
    "You are verifying one draft category assignment for a transaction.",
    'Return strict JSON only: {"categoryId":"uuid-or-null","confidence":0.0}',
    "Keep correct assignments, fix obvious mistakes, and return null if it still looks uncertain.",
    "Be especially strict with MobilePay: keep it only for actual peer-to-peer MobilePay transfers, never for merchants or service bills.",
    "Easy Park must be parking. Oister must be Household / Phone. Apple.com/BILL is not MobilePay. Banken Food Hall is Food / Restaurants. Monobank and Revolut transfers are Transfers / Transfer when available. Salary descriptors are Income / Salary.",
    `Transaction name: ${name}`,
    `Comment: ${comment || "(none)"}`,
    `Draft assignment: ${proposedLabel}; confidence=${draft.confidence.toFixed(2)}`,
  ].join("\n");
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return errorJsonSingle("Method not allowed", 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !authHeader) {
    console.warn("[suggest-category] Missing auth configuration or Authorization header.");
    return errorJsonSingle("Unauthorized", 401);
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: anonKey,
    },
  }).catch(() => null);
  if (!authResponse?.ok) {
    console.warn("[suggest-category] Auth validation failed.", {
      status: authResponse?.status ?? null,
    });
    return errorJsonSingle("Unauthorized", 401);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    console.warn("[suggest-category] Invalid JSON body.");
    return errorJsonSingle("Invalid request body", 400);
  }

  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const history = Array.isArray(body.history) ? body.history : [];
  if (candidates.length === 0) {
    console.warn("[suggest-category] Missing candidate categories.");
    return errorJsonSingle("Candidates are required", 400);
  }

  const batchRows: NormalizedBatchRow[] = Array.isArray(body.rows)
    ? body.rows
        .map((row): NormalizedBatchRow => ({
          id: typeof row.id === "string" ? row.id : "",
          name: typeof row.name === "string" ? row.name.trim() : "",
          comment: typeof row.comment === "string" ? row.comment.trim() : "",
          kind: row.kind === "income" ? "income" : "expense",
        }))
        .filter((row) => row.id.length > 0)
    : [];

  const key = Deno.env.get("GROQ_API_KEY");

  if (batchRows.length > 0) {
    if (!key) {
      console.warn("[suggest-category] GROQ_API_KEY is missing for batch mode. Returning deterministic-only results.");
      return jsonBatch({
        results: repairBatchResults({
          rows: batchRows,
          parsedResults: [],
          candidates,
          history,
        }),
      });
    }

    try {
      console.info("[suggest-category] Invoking Groq batch categorization.", {
        candidateCount: candidates.length,
        historyCount: history.length,
        rowCount: batchRows.length,
      });

      const firstPassPrompt = buildBatchPrompt({
        rows: batchRows,
        candidates,
        history,
      });
      const firstPass = await invokeGroq({
        key,
        prompt: firstPassPrompt,
        maxTokens: 720,
        timeoutMs: 6200,
      });
      const firstPassResults =
        !firstPass.degraded && firstPass.text !== null
          ? parseBatchResults(firstPass.text, new Set(candidates.map((candidate) => candidate.id)))
          : [];

      const verifierPrompt = buildBatchVerifierPrompt({
        rows: batchRows,
        draftResults: firstPassResults,
        candidates,
      });
      const secondPass = await invokeGroq({
        key,
        prompt: verifierPrompt,
        maxTokens: 720,
        timeoutMs: 6200,
      });
      const hasSecondPassResults = !secondPass.degraded && secondPass.text !== null;
      const secondPassResults = hasSecondPassResults
        ? parseBatchResults(secondPass.text!, new Set(candidates.map((candidate) => candidate.id)))
        : [];

      const repairedResults = repairBatchResults({
        rows: batchRows,
        parsedResults: hasSecondPassResults ? secondPassResults : firstPassResults,
        candidates,
        history,
      });

      return jsonBatch({ results: repairedResults });
    } catch (error) {
      console.error("[suggest-category] Unexpected batch Groq error.", error);
      return jsonBatch({
        results: repairBatchResults({
          rows: batchRows,
          parsedResults: [],
          candidates,
          history,
        }),
      });
    }
  }

  const name = (body.name ?? "").trim();
  const comment = (body.comment ?? "").trim();
  if (name.length === 0) {
    console.warn("[suggest-category] Missing required input.", {
      hasName: false,
      candidateCount: candidates.length,
    });
    return jsonSingle({ categoryId: null, confidence: 0 });
  }

  const hardcoded = resolveHardcodedCategoryId({
    kind: "expense",
    name,
    comment,
    candidates,
  });
  if (hardcoded) {
    return jsonSingle({
      categoryId: hardcoded.categoryId,
      confidence: hardcoded.confidence,
    });
  }

  if (!key) {
    console.error("[suggest-category] GROQ_API_KEY is missing.");
    return errorJsonSingle("AI provider is not configured", 503);
  }

  try {
    console.info("[suggest-category] Invoking Groq.", {
      candidateCount: candidates.length,
      historyCount: history.length,
      hasComment: comment.length > 0,
      nameLength: name.length,
    });

    const firstPassPrompt = buildSinglePrompt({
      name,
      comment,
      candidates,
      history,
    });
    const firstPass = await invokeGroq({
      key,
      prompt: firstPassPrompt,
      maxTokens: 180,
      timeoutMs: 4200,
    });
    const firstPassResult =
      !firstPass.degraded && firstPass.text !== null ? parseSingleResult(firstPass.text, candidates) : null;

    const secondPassPrompt = buildSingleVerifierPrompt({
      name,
      comment,
      draft: firstPassResult ?? { categoryId: null, confidence: 0 },
      candidates,
    });
    const secondPass = await invokeGroq({
      key,
      prompt: secondPassPrompt,
      maxTokens: 180,
      timeoutMs: 4200,
    });
    const hasSecondPassResult = !secondPass.degraded && secondPass.text !== null;
    const secondPassResult = hasSecondPassResult ? parseSingleResult(secondPass.text!, candidates) : null;

    const accepted = acceptSuggestion({
      name,
      comment,
      kind: "expense",
      parsed: hasSecondPassResult ? secondPassResult : firstPassResult,
      candidates,
      history,
    });

    return jsonSingle(accepted);
  } catch (error) {
    console.error("[suggest-category] Unexpected Groq error.", error);
    return errorJsonSingle("AI provider request failed", 502);
  }
});

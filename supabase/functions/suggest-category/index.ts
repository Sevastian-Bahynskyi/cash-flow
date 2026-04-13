import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  normalizeAsciiText,
  normalizeMerchantContext,
  resolveCuratedCategoryId,
  type Candidate,
  type TransactionKind,
} from "../_shared/merchant-intelligence";

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

type RankedCandidate = {
  categoryId?: string;
  source?: "rule" | "memory_exact" | "memory_fuzzy";
  confidence?: number;
  canonicalMerchant?: string | null;
  matchedPattern?: string | null;
  similarity?: number | null;
  observationCount?: number | null;
  supportRatio?: number | null;
  isSharedTopup?: boolean;
};

type BatchInputRow = {
  id?: string;
  kind?: TransactionKind;
  name?: string;
  comment?: string | null;
  rawText?: string | null;
  message?: string | null;
  transactionType?: string | null;
  sender?: string | null;
  receiver?: string | null;
  bankCategory?: string | null;
  normalizedMerchant?: string | null;
  deterministicCandidates?: RankedCandidate[];
};

type Body = {
  kind?: TransactionKind;
  name?: string;
  comment?: string | null;
  rawText?: string | null;
  message?: string | null;
  transactionType?: string | null;
  sender?: string | null;
  receiver?: string | null;
  bankCategory?: string | null;
  normalizedMerchant?: string | null;
  deterministicCandidates?: RankedCandidate[];
  rows?: BatchInputRow[];
  candidates?: Candidate[];
};

type SuggestResult = {
  categoryId: string | null;
  confidence: number;
  isSharedTopup: boolean;
};

type BatchSuggestResult = {
  id: string;
  categoryId: string;
  confidence: number;
  isSharedTopup: boolean;
};

type GroqResponsePayload = {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
};

type NormalizedBatchRow = Required<
  Pick<
    BatchInputRow,
    "id" | "kind" | "name" | "comment" | "rawText" | "message" | "transactionType" | "sender" | "receiver" | "bankCategory" | "normalizedMerchant"
  >
> & {
  deterministicCandidates: RankedCandidate[];
};

const jsonSingle = (body: SuggestResult, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

const jsonBatch = (body: { results: BatchSuggestResult[]; error?: string }, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

const errorJsonSingle = (message: string, status: number): Response =>
  new Response(JSON.stringify({ categoryId: null, confidence: 0, isSharedTopup: false, error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const mentionMobilePay = (value: string): boolean =>
  /\bmobilepay\b|\bmob pay\b|\bmp\b/.test(normalizeAsciiText(value));

const findMobilePayCategoryId = (candidates: readonly Candidate[]): string | null =>
  candidates.find(
    (candidate) =>
      candidate.parent.trim().toLowerCase() === "transfers" &&
      candidate.name.trim().toLowerCase() === "mobilepay",
  )?.id ?? null;

const isMobilePayCategoryId = (
  categoryId: string | null | undefined,
  candidates: readonly Candidate[],
): boolean => categoryId === findMobilePayCategoryId(candidates);

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
      const confidence = clamp(toNumber(parsed.confidence) ?? 0);
      return { categoryId, confidence: categoryId ? confidence : 0, isSharedTopup: false };
    } catch {
      return { categoryId: null, confidence: 0, isSharedTopup: false };
    }
  }
  return { categoryId: null, confidence: 0, isSharedTopup: false };
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
      confidence: clamp(toNumber(objectRow.confidence) ?? 0),
      isSharedTopup: Boolean(objectRow.isSharedTopup),
    });
  }

  return parsed;
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
        signal: AbortSignal.timeout(attempt === 0 ? timeoutMs : Math.round(timeoutMs * 1.4)),
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        console.error("[suggest-category] Groq request failed.", {
          attempt: attempt + 1,
          status: response.status,
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
      console.error("[suggest-category] Unexpected Groq error.", {
        attempt: attempt + 1,
        message: error instanceof Error ? error.message : String(error),
      });
      if (attempt === 0) {
        await wait(120);
        continue;
      }
    }
  }

  return { text: null, degraded: true };
};

const formatDeterministicCandidates = (
  deterministicCandidates: readonly RankedCandidate[],
  candidates: readonly Candidate[],
): string => {
  if (deterministicCandidates.length === 0) return "(none)";

  return deterministicCandidates
    .slice(0, 4)
    .map((item, index) => {
      const category = candidates.find((candidate) => candidate.id === item.categoryId);
      if (!category) return null;
      const details = [
        `source=${item.source ?? "unknown"}`,
        typeof item.confidence === "number" ? `confidence=${item.confidence.toFixed(2)}` : null,
        typeof item.similarity === "number" ? `similarity=${item.similarity.toFixed(2)}` : null,
        typeof item.supportRatio === "number" ? `support=${item.supportRatio.toFixed(2)}` : null,
        typeof item.observationCount === "number" ? `seen=${item.observationCount}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `${index + 1}. ${category.parent} / ${category.name} [${category.id}] (${details})`;
    })
    .filter((item): item is string => Boolean(item))
    .join("\n");
};

const buildSinglePrompt = ({
  row,
  candidates,
}: {
  row: Omit<NormalizedBatchRow, "id">;
  candidates: readonly Candidate[];
}): string => {
  const candidateList = candidates
    .map((candidate, index) => `${index + 1}. ${candidate.parent} / ${candidate.name} [${candidate.id}]`)
    .join("\n");

  return [
    "You categorize financial transactions that already passed a deterministic merchant rules engine.",
    'Return strict JSON only: {"categoryId":"uuid-or-null","confidence":0.0,"isSharedTopup":false}',
    "You are only handling unresolved leftovers. Be strict and return null when unsure.",
    "Use the merchant or service brand as the primary clue, not the payment rail.",
    "Anti-patterns you must avoid:",
    "1. Do not assign MobilePay just because text contains MobilePay or Mob.Pay.",
    "2. If a clear merchant exists, categorize the merchant, not the rail.",
    "3. Apple.com/BILL is an Apple subscription or bill, not MobilePay.",
    "4. Easy Park is parking.",
    "5. OiSTER and Lebara are phone providers.",
    "6. Banken Food Hall is a restaurant expense.",
    "7. Revolut, Monobank, and TransferGo are transfers, not MobilePay.",
    "8. LONOVERFORSEL is salary income. SU is benefits. Interest is interest income.",
    `Kind: ${row.kind}`,
    `Name: ${row.name}`,
    `Raw text: ${row.rawText || "(none)"}`,
    `Comment: ${row.comment || "(none)"}`,
    `Message: ${row.message || "(none)"}`,
    `Transaction type: ${row.transactionType || "(none)"}`,
    `Sender: ${row.sender || "(none)"}`,
    `Receiver: ${row.receiver || "(none)"}`,
    `Bank category hint: ${row.bankCategory || "(none)"}`,
    `Normalized merchant: ${row.normalizedMerchant || "(none)"}`,
    `Top deterministic candidates:\n${formatDeterministicCandidates(row.deterministicCandidates, candidates)}`,
    `Allowed categories:\n${candidateList}`,
  ].join("\n\n");
};

const buildSingleVerifierPrompt = ({
  row,
  draft,
  candidates,
}: {
  row: Omit<NormalizedBatchRow, "id">;
  draft: SuggestResult;
  candidates: readonly Candidate[];
}): string => {
  const category = draft.categoryId ? candidates.find((candidate) => candidate.id === draft.categoryId) ?? null : null;
  const proposedLabel = category ? `${category.parent} / ${category.name} [${category.id}]` : "null";

  return [
    "You are verifying one draft category assignment for a bank transaction.",
    'Return strict JSON only: {"categoryId":"uuid-or-null","confidence":0.0,"isSharedTopup":false}',
    "Keep correct assignments, fix obvious mistakes, or return null if it still looks uncertain.",
    "Be especially strict with MobilePay. It is only correct for real peer-to-peer MobilePay transfers.",
    `Name: ${row.name}`,
    `Raw text: ${row.rawText || "(none)"}`,
    `Message: ${row.message || "(none)"}`,
    `Transaction type: ${row.transactionType || "(none)"}`,
    `Sender: ${row.sender || "(none)"}`,
    `Receiver: ${row.receiver || "(none)"}`,
    `Bank category hint: ${row.bankCategory || "(none)"}`,
    `Normalized merchant: ${row.normalizedMerchant || "(none)"}`,
    `Draft assignment: ${proposedLabel}; confidence=${draft.confidence.toFixed(2)}`,
  ].join("\n\n");
};

const buildBatchPrompt = ({
  rows,
  candidates,
}: {
  rows: readonly NormalizedBatchRow[];
  candidates: readonly Candidate[];
}): string => {
  const candidateList = candidates
    .map((candidate, index) => `${index + 1}. ${candidate.parent} / ${candidate.name} [${candidate.id}]`)
    .join("\n");

  const rowList = rows
    .map(
      (row, index) =>
        `${index + 1}. id=${row.id}; kind=${row.kind}; name=${row.name}; rawText=${row.rawText || "(none)"}; message=${row.message || "(none)"}; type=${row.transactionType || "(none)"}; sender=${row.sender || "(none)"}; receiver=${row.receiver || "(none)"}; bankCategory=${row.bankCategory || "(none)"}; normalizedMerchant=${row.normalizedMerchant || "(none)"}; candidates=${formatDeterministicCandidates(row.deterministicCandidates, candidates)}`,
    )
    .join("\n\n");

  return [
    "You categorize unresolved financial transactions after deterministic merchant intelligence already ran.",
    'Return strict JSON only: {"results":[{"id":"row-id","categoryId":"uuid","confidence":0.0,"isSharedTopup":false}]}',
    "Only include rows you can classify with very high confidence.",
    "Never use MobilePay for merchants or service bills.",
    "Easy Park is parking. OiSTER and Lebara are phone providers. Apple is subscriptions. Banken Food Hall is restaurants. Revolut, Monobank, and TransferGo are transfers.",
    `Rows:\n${rowList}`,
    `Allowed categories:\n${candidateList}`,
  ].join("\n\n");
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
    .map((result) => {
      const row = rows.find((item) => item.id === result.id);
      const category = candidateById.get(result.categoryId);
      if (!row || !category) return null;
      return `id=${row.id}; name=${row.name}; rawText=${row.rawText || "(none)"}; normalizedMerchant=${row.normalizedMerchant}; proposed=${category.parent} / ${category.name} [${category.id}]; confidence=${result.confidence.toFixed(2)}`;
    })
    .filter((item): item is string => Boolean(item))
    .join("\n");

  return [
    "You are verifying draft category assignments for unresolved bank transactions.",
    'Return strict JSON only: {"results":[{"id":"row-id","categoryId":"uuid","confidence":0.0,"isSharedTopup":false}]}',
    "Keep correct assignments, fix obvious mistakes, and omit any row that is still uncertain.",
    "Be very conservative with MobilePay. It only belongs to real person-to-person transfers.",
    `Draft assignments:\n${draftList || "(none)"}`,
  ].join("\n\n");
};

const shouldRejectMobilePayProposal = ({
  row,
  categoryId,
  confidence,
  candidates,
}: {
  row: Omit<NormalizedBatchRow, "id">;
  categoryId: string | null;
  confidence: number;
  candidates: readonly Candidate[];
}): boolean => {
  if (!isMobilePayCategoryId(categoryId, candidates)) return false;

  const combinedText = [row.name, row.rawText, row.message, row.comment].filter(Boolean).join(" ");
  if (!mentionMobilePay(combinedText)) return true;
  if (row.normalizedMerchant && row.normalizedMerchant !== "mobilepay") return true;

  return confidence < 0.92;
};

const finalizeSuggestion = ({
  row,
  parsed,
  candidates,
}: {
  row: Omit<NormalizedBatchRow, "id">;
  parsed: SuggestResult | null;
  candidates: readonly Candidate[];
}): SuggestResult => {
  const curated = resolveCuratedCategoryId({
    context: {
      kind: row.kind,
      name: row.name,
      comment: row.comment,
      rawText: row.rawText,
      message: row.message,
      sender: row.sender,
    },
    candidates,
  });
  if (curated) {
    return {
      categoryId: curated.categoryId,
      confidence: curated.confidence,
      isSharedTopup: row.normalizedMerchant === "revolut",
    };
  }

  if (!parsed?.categoryId) {
    return { categoryId: null, confidence: 0, isSharedTopup: false };
  }

  if (shouldRejectMobilePayProposal({ row, categoryId: parsed.categoryId, confidence: parsed.confidence, candidates })) {
    return { categoryId: null, confidence: 0, isSharedTopup: false };
  }

  const topDeterministic = row.deterministicCandidates[0];
  if (
    topDeterministic?.categoryId &&
    parsed.categoryId !== topDeterministic.categoryId &&
    (topDeterministic.confidence ?? 0) >= 0.8 &&
    parsed.confidence < 0.96
  ) {
    return { categoryId: null, confidence: 0, isSharedTopup: false };
  }

  return {
    categoryId: parsed.categoryId,
    confidence: clamp(parsed.confidence),
    isSharedTopup: parsed.isSharedTopup ?? row.normalizedMerchant === "revolut",
  };
};

const normalizeSingleRow = (body: Body): Omit<NormalizedBatchRow, "id"> => ({
  kind: body.kind === "income" ? "income" : "expense",
  name: typeof body.name === "string" ? body.name.trim() : "",
  comment: typeof body.comment === "string" ? body.comment.trim() : "",
  rawText: typeof body.rawText === "string" && body.rawText.trim().length > 0 ? body.rawText.trim() : typeof body.name === "string" ? body.name.trim() : "",
  message: typeof body.message === "string" ? body.message.trim() : "",
  transactionType: typeof body.transactionType === "string" ? body.transactionType.trim() : "",
  sender: typeof body.sender === "string" ? body.sender.trim() : "",
  receiver: typeof body.receiver === "string" ? body.receiver.trim() : "",
  bankCategory: typeof body.bankCategory === "string" ? body.bankCategory.trim() : "",
  normalizedMerchant:
    typeof body.normalizedMerchant === "string" && body.normalizedMerchant.trim().length > 0
      ? body.normalizedMerchant.trim()
      : normalizeMerchantContext({
          kind: body.kind === "income" ? "income" : "expense",
          name: typeof body.name === "string" ? body.name.trim() : "",
          comment: typeof body.comment === "string" ? body.comment.trim() : "",
          rawText: typeof body.rawText === "string" ? body.rawText.trim() : typeof body.name === "string" ? body.name.trim() : "",
          message: typeof body.message === "string" ? body.message.trim() : "",
          sender: typeof body.sender === "string" ? body.sender.trim() : "",
        }),
  deterministicCandidates: Array.isArray(body.deterministicCandidates) ? body.deterministicCandidates : [],
});

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return errorJsonSingle("Method not allowed", 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !authHeader) {
    return errorJsonSingle("Unauthorized", 401);
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: anonKey,
    },
  }).catch(() => null);
  if (!authResponse?.ok) {
    return errorJsonSingle("Unauthorized", 401);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return errorJsonSingle("Invalid request body", 400);
  }

  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  if (candidates.length === 0) {
    return errorJsonSingle("Candidates are required", 400);
  }

  const key = Deno.env.get("GROQ_API_KEY");

  const batchRows: NormalizedBatchRow[] = Array.isArray(body.rows)
    ? body.rows
        .map((row): NormalizedBatchRow => ({
          id: typeof row.id === "string" ? row.id : "",
          kind: row.kind === "income" ? "income" : "expense",
          name: typeof row.name === "string" ? row.name.trim() : "",
          comment: typeof row.comment === "string" ? row.comment.trim() : "",
          rawText: typeof row.rawText === "string" && row.rawText.trim().length > 0 ? row.rawText.trim() : typeof row.name === "string" ? row.name.trim() : "",
          message: typeof row.message === "string" ? row.message.trim() : "",
          transactionType: typeof row.transactionType === "string" ? row.transactionType.trim() : "",
          sender: typeof row.sender === "string" ? row.sender.trim() : "",
          receiver: typeof row.receiver === "string" ? row.receiver.trim() : "",
          bankCategory: typeof row.bankCategory === "string" ? row.bankCategory.trim() : "",
          normalizedMerchant:
            typeof row.normalizedMerchant === "string" && row.normalizedMerchant.trim().length > 0
              ? row.normalizedMerchant.trim()
              : normalizeMerchantContext({
                  kind: row.kind === "income" ? "income" : "expense",
                  name: typeof row.name === "string" ? row.name.trim() : "",
                  comment: typeof row.comment === "string" ? row.comment.trim() : "",
                  rawText: typeof row.rawText === "string" ? row.rawText.trim() : typeof row.name === "string" ? row.name.trim() : "",
                  message: typeof row.message === "string" ? row.message.trim() : "",
                  sender: typeof row.sender === "string" ? row.sender.trim() : "",
                }),
          deterministicCandidates: Array.isArray(row.deterministicCandidates) ? row.deterministicCandidates : [],
        }))
        .filter((row) => row.id.length > 0 && row.name.length > 0)
    : [];

  if (batchRows.length > 0) {
    if (!key) {
      return jsonBatch({ results: [] });
    }

    try {
      const firstPass = await invokeGroq({
        key,
        prompt: buildBatchPrompt({ rows: batchRows, candidates }),
        maxTokens: 900,
        timeoutMs: 6200,
      });
      const firstPassResults =
        !firstPass.degraded && firstPass.text !== null
          ? parseBatchResults(firstPass.text, new Set(candidates.map((candidate) => candidate.id)))
          : [];

      const allHighConfidence =
        firstPassResults.length > 0 &&
        firstPassResults.length >= batchRows.length &&
        firstPassResults.every((r) => r.confidence >= 0.96);

      const verifiedResults = allHighConfidence
        ? firstPassResults
        : await (async () => {
            const secondPass = await invokeGroq({
              key,
              prompt: buildBatchVerifierPrompt({ rows: batchRows, draftResults: firstPassResults, candidates }),
              maxTokens: 900,
              timeoutMs: 6200,
            });
            return !secondPass.degraded && secondPass.text !== null
              ? parseBatchResults(secondPass.text, new Set(candidates.map((candidate) => candidate.id)))
              : firstPassResults;
          })();

      const finalized = batchRows
        .map((row) => {
          const parsed = verifiedResults.find((result) => result.id === row.id) ?? null;
          const finalizedSingle = finalizeSuggestion({
            row,
            parsed,
            candidates,
          });
          if (!finalizedSingle.categoryId || finalizedSingle.confidence < 0.92) return null;
          return {
            id: row.id,
            categoryId: finalizedSingle.categoryId,
            confidence: finalizedSingle.confidence,
            isSharedTopup: finalizedSingle.isSharedTopup ?? row.normalizedMerchant === "revolut",
          };
        })
        .filter((row): row is BatchSuggestResult => Boolean(row));

      return jsonBatch({ results: finalized });
    } catch (error) {
      console.error("[suggest-category] Unexpected batch Groq error.", error);
      return jsonBatch({ results: [] });
    }
  }

  const row = normalizeSingleRow(body);
  if (!row.name) {
    return jsonSingle({ categoryId: null, confidence: 0, isSharedTopup: false });
  }

  const curated = resolveCuratedCategoryId({
    context: {
      kind: row.kind,
      name: row.name,
      comment: row.comment,
      rawText: row.rawText,
      message: row.message,
      sender: row.sender,
    },
    candidates,
  });
  if (curated) {
    return jsonSingle({
      categoryId: curated.categoryId,
      confidence: curated.confidence,
      isSharedTopup: row.normalizedMerchant === "revolut",
    });
  }

  if (!key) {
    return errorJsonSingle("AI provider is not configured", 503);
  }

  try {
    const firstPass = await invokeGroq({
      key,
      prompt: buildSinglePrompt({ row, candidates }),
      maxTokens: 220,
      timeoutMs: 4200,
    });
    const firstPassResult =
      !firstPass.degraded && firstPass.text !== null ? parseSingleResult(firstPass.text, candidates) : null;

    const skipVerifier = firstPassResult !== null && firstPassResult.confidence >= 0.96;

    const secondPassResult = skipVerifier
      ? firstPassResult
      : await (async () => {
          const secondPass = await invokeGroq({
            key,
            prompt: buildSingleVerifierPrompt({
              row,
              draft: firstPassResult ?? { categoryId: null, confidence: 0, isSharedTopup: false },
              candidates,
            }),
            maxTokens: 220,
            timeoutMs: 4200,
          });
          return !secondPass.degraded && secondPass.text !== null
            ? parseSingleResult(secondPass.text, candidates)
            : firstPassResult;
        })();

    const finalized = finalizeSuggestion({
      row,
      parsed: secondPassResult,
      candidates,
    });
    return jsonSingle(finalized);
  } catch (error) {
    console.error("[suggest-category] Unexpected Groq error.", error);
    return errorJsonSingle("AI provider request failed", 502);
  }
});

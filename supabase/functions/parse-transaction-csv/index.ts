import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

type Candidate = {
  id: string;
  parent: string;
  name: string;
};

type Body = {
  csvText?: string;
  fileName?: string | null;
  candidates?: Candidate[];
  today?: string;
};

type ParsedTransaction = {
  kind: "expense" | "income";
  name: string;
  amount: number;
  currencyCode: string;
  categoryId: string | null;
  comment: string | null;
  occurredOn: string;
};

type ResponseBody = {
  transactions: ParsedTransaction[];
  error?: string;
};

const json = (body: ResponseBody, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

const errorJson = (message: string, status: number): Response =>
  json({ transactions: [], error: message }, { status });

const normalizeDate = (value: unknown, fallback: string): string => {
  const text = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
};

const normalizeCurrencyCode = (value: unknown): string => {
  const text = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(text) ? text : "DKK";
};

const normalizeComment = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
};

const normalizeName = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
};

const normalizeAmount = (value: unknown): number | null => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim().replace(",", "."))
        : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100) / 100;
};

const parseTransactions = (
  text: string,
  fallbackDate: string,
  validCategoryIds: Set<string>,
): ParsedTransaction[] => {
  const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }

  const rawRows =
    Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && "transactions" in raw && Array.isArray((raw as { transactions?: unknown }).transactions)
        ? (raw as { transactions: unknown[] }).transactions
        : [];

  return rawRows
    .map((row): ParsedTransaction | null => {
      if (!row || typeof row !== "object") return null;
      const objectRow = row as Record<string, unknown>;
      const name = normalizeName(objectRow.name);
      const amount = normalizeAmount(objectRow.amount);
      if (!name || amount === null) return null;

      const categoryId =
        typeof objectRow.categoryId === "string" && validCategoryIds.has(objectRow.categoryId)
          ? objectRow.categoryId
          : null;
      const kind = objectRow.kind === "income" ? "income" : "expense";

      return {
        kind,
        name,
        amount,
        currencyCode: normalizeCurrencyCode(objectRow.currencyCode),
        categoryId,
        comment: normalizeComment(objectRow.comment),
        occurredOn: normalizeDate(objectRow.occurredOn, fallbackDate),
      };
    })
    .filter((row): row is ParsedTransaction => Boolean(row));
};

const trimCsv = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length <= 60_000) return trimmed;
  return trimmed.slice(0, 60_000);
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return errorJson("Method not allowed", 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !authHeader) {
    console.warn("[parse-transaction-csv] Missing auth configuration or Authorization header.");
    return errorJson("Unauthorized", 401);
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: anonKey,
    },
  }).catch(() => null);
  if (!authResponse?.ok) {
    console.warn("[parse-transaction-csv] Auth validation failed.", {
      status: authResponse?.status ?? null,
    });
    return errorJson("Unauthorized", 401);
  }

  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) {
    console.error("[parse-transaction-csv] GROQ_API_KEY is missing.");
    return errorJson("AI provider is not configured", 503);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    console.warn("[parse-transaction-csv] Invalid JSON body.");
    return errorJson("Invalid request body", 400);
  }

  const csvText = typeof body.csvText === "string" ? trimCsv(body.csvText) : "";
  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const today = typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : "1970-01-01";

  if (!csvText || candidates.length === 0) {
    console.warn("[parse-transaction-csv] Missing required input.");
    return errorJson("CSV contents and category options are required", 400);
  }

  const validCategoryIds = new Set(candidates.map((candidate) => candidate.id));
  const candidateList = candidates
    .map((candidate, index) => `${index + 1}. ${candidate.parent} / ${candidate.name} [${candidate.id}]`)
    .join("\n");

  const prompt = [
    "You are parsing a bank statement CSV into actual app transactions.",
    "Read the CSV carefully and create one transaction per completed statement row.",
    "Ignore balance-only rows, opening/closing balance rows, headers, totals, empty lines, and duplicate summary rows.",
    "Treat money received as income and money spent as expense.",
    "Return positive amounts only. Determine kind from the statement direction/sign.",
    "Prefer the merchant/payee/description for the transaction name.",
    "If a note or reference is useful, put it into comment, otherwise return null.",
    "Return strict JSON only with this shape:",
    '{"transactions":[{"kind":"expense","name":"string","amount":12.34,"currencyCode":"DKK","categoryId":"uuid-or-null","comment":"string-or-null","occurredOn":"YYYY-MM-DD"}]}',
    "Use only category ids from the candidate list.",
    "If the category is unclear for an expense, return null for categoryId.",
    "If the CSV date is unclear, use the provided fallback date.",
    "If the currency is not present, infer it from the statement if obvious, otherwise use DKK.",
    `Fallback date: ${today}`,
    fileName ? `Filename: ${fileName}` : "Filename: unknown.csv",
    `Candidate categories:\n${candidateList}`,
    "CSV contents:",
    csvText,
  ].join("\n\n");

  try {
    console.info("[parse-transaction-csv] Invoking Groq.", {
      candidateCount: candidates.length,
      csvChars: csvText.length,
    });
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0,
        max_tokens: 1400,
        messages: [
          {
            role: "system",
            content:
              'Return strict JSON only in the shape {"transactions":[{"kind":"expense","name":"string","amount":12.34,"currencyCode":"DKK","categoryId":"uuid-or-null","comment":"string-or-null","occurredOn":"YYYY-MM-DD"}]}.',
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      console.error("[parse-transaction-csv] Groq request failed.", {
        status: response.status,
        statusText: response.statusText,
        body: responseText.slice(0, 400),
      });
      return errorJson("AI provider request failed", 502);
    }

    const payload = await response.json();
    const text: string = payload?.choices?.[0]?.message?.content ?? "";
    const transactions = parseTransactions(text, today, validCategoryIds);
    console.info("[parse-transaction-csv] Groq returned transactions.", {
      count: transactions.length,
    });
    return json({ transactions });
  } catch (error) {
    console.error("[parse-transaction-csv] Unexpected Groq error.", error);
    return errorJson("AI provider request failed", 502);
  }
});

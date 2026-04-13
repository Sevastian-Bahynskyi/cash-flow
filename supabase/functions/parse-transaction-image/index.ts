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
  imageDataUrl?: string;
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

const GROQ_IMAGE_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct";

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

const parseLocalizedAmount = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const sanitized = trimmed
    .replace(/[\u00a0\u202f\s]/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/[^0-9,.'-]/g, "");

  if (!sanitized) return null;

  const negative = sanitized.startsWith("-");
  const unsigned = sanitized.replace(/-/g, "");
  if (!unsigned || !/\d/.test(unsigned)) return null;

  const lastDot = unsigned.lastIndexOf(".");
  const lastComma = unsigned.lastIndexOf(",");
  const lastSeparatorIndex = Math.max(lastDot, lastComma);

  let normalized = unsigned;
  if (lastSeparatorIndex >= 0) {
    const decimalSeparator = unsigned[lastSeparatorIndex] ?? "";
    const integerPart = unsigned.slice(0, lastSeparatorIndex);
    const fractionalPart = unsigned.slice(lastSeparatorIndex + 1);
    const separatorCount = (unsigned.match(/[.,]/g) ?? []).length;
    const hasMultipleSeparators = separatorCount > 1;
    const looksLikeDecimal =
      fractionalPart.length > 0 &&
      fractionalPart.length <= 2 &&
      (hasMultipleSeparators || !integerPart.includes("'"));

    if (looksLikeDecimal) {
      const normalizedInteger = integerPart.replace(/[.,']/g, "");
      normalized = `${normalizedInteger}.${fractionalPart.replace(/[.,']/g, "")}`;
    } else {
      normalized = unsigned.replace(/[.,']/g, "");
    }
  } else {
    normalized = unsigned.replace(/'/g, "");
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const numeric = Number(`${negative ? "-" : ""}${normalized}`);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100) / 100;
};

const normalizeAmount = (value: unknown): number | null => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseLocalizedAmount(value)
        : null;
  if (numeric === null || !Number.isFinite(numeric) || numeric <= 0) return null;
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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return errorJson("Method not allowed", 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !authHeader) {
    console.warn("[parse-transaction-image] Missing auth configuration or Authorization header.");
    return errorJson("Unauthorized", 401);
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: anonKey,
    },
  }).catch(() => null);
  if (!authResponse?.ok) {
    console.warn("[parse-transaction-image] Auth validation failed.", {
      status: authResponse?.status ?? null,
    });
    return errorJson("Unauthorized", 401);
  }

  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) {
    console.error("[parse-transaction-image] GROQ_API_KEY is missing.");
    return errorJson("AI provider is not configured", 503);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    console.warn("[parse-transaction-image] Invalid JSON body.");
    return errorJson("Invalid request body", 400);
  }

  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl.trim() : "";
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const today = typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : "1970-01-01";

  if (!imageDataUrl || candidates.length === 0) {
    console.warn("[parse-transaction-image] Missing required input.");
    return errorJson("Image and category options are required", 400);
  }

  const validCategoryIds = new Set(candidates.map((candidate) => candidate.id));
  const candidateList = candidates
    .map((candidate, index) => `${index + 1}. ${candidate.parent} / ${candidate.name} [${candidate.id}]`)
    .join("\n");

  const prompt = [
    "Extract actual financial transactions visible in the image.",
    "If the image is a receipt for one purchase, create one transaction for the total paid.",
    "If the image shows a list of completed transactions, create one transaction per visible completed row.",
    "Do not create grocery line items from a single receipt unless the image clearly shows separate completed payments.",
    "Read amounts exactly as printed in the image before converting them to JSON numbers.",
    "Support common number formats. Examples: '4040' -> 4040, '4 040' -> 4040, '4.040' -> 4040, '4,040' -> 4040, '4.040,00' -> 4040.00, '4,040.00' -> 4040.00, '4040,00' -> 4040.00, '40.40' -> 40.40, '40,40' -> 40.40.",
    "Only include cents when the image explicitly shows cents or the currency format clearly uses decimals.",
    "For single-receipt photos, prefer the final paid total (for example TOTAL, Amount paid, Card payment, Dankort, Visa, Mastercard) over subtotal, tax, discount, change, or item rows.",
    "If multiple totals are visible on a receipt, choose the amount that represents the completed payment, not the savings, fee, cashback, or running balance.",
    "Return strict JSON only with this shape:",
    '{"transactions":[{"kind":"expense","name":"string","amount":12.34,"currencyCode":"DKK","categoryId":"uuid-or-null","comment":"string-or-null","occurredOn":"YYYY-MM-DD"}]}',
    "Use only category ids from the candidate list.",
    "If the date is unclear, use the provided fallback date.",
    "If the category is unclear for an expense, return null for categoryId.",
    "For person-to-person MobilePay transfers, use the visible counterparty person name as name when available, not just 'MobilePay'.",
    `Fallback date: ${today}`,
    `Candidate categories:\n${candidateList}`,
  ].join("\n");

  try {
    console.info("[parse-transaction-image] Invoking Groq.", {
      candidateCount: candidates.length,
      imageBytesApprox: imageDataUrl.length,
      model: GROQ_IMAGE_MODEL,
    });
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: GROQ_IMAGE_MODEL,
        temperature: 0,
        max_tokens: 900,
        response_format: {
          type: "json_object",
        },
        messages: [
          {
            role: "system",
            content:
              [
                'Return strict JSON only in the shape {"transactions":[{"kind":"expense","name":"string","amount":12.34,"currencyCode":"DKK","categoryId":"uuid-or-null","comment":"string-or-null","occurredOn":"YYYY-MM-DD"}]}.',
                "Be conservative with OCR. If a number is shown without decimals, keep it as a whole-unit amount.",
                "Preserve thousands separators correctly before converting to JSON numbers.",
              ].join(" "),
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      console.error("[parse-transaction-image] Groq request failed.", {
        status: response.status,
        statusText: response.statusText,
        body: responseText.slice(0, 400),
      });
      return errorJson("AI provider request failed", 502);
    }

    const payload = await response.json();
    const text: string = payload?.choices?.[0]?.message?.content ?? "";
    const transactions = parseTransactions(text, today, validCategoryIds);
    console.info("[parse-transaction-image] Groq returned transactions.", {
      count: transactions.length,
    });
    return json({ transactions });
  } catch (error) {
    console.error("[parse-transaction-image] Unexpected Groq error.", error);
    return errorJson("AI provider request failed", 502);
  }
});

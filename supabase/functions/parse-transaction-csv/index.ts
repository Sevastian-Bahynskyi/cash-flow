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

const normalizeHeaderKey = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const parseSignedLocalizedAmount = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const negativeByParens = /\(.*\)/.test(trimmed);
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
    const integerPart = unsigned.slice(0, lastSeparatorIndex);
    const fractionalPart = unsigned.slice(lastSeparatorIndex + 1);
    const separatorCount = (unsigned.match(/[.,]/g) ?? []).length;
    const looksLikeDecimal = fractionalPart.length > 0 && fractionalPart.length <= 2 && separatorCount >= 1;

    if (looksLikeDecimal) {
      normalized = `${integerPart.replace(/[.,']/g, "")}.${fractionalPart.replace(/[.,']/g, "")}`;
    } else {
      normalized = unsigned.replace(/[.,']/g, "");
    }
  } else {
    normalized = unsigned.replace(/'/g, "");
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const numeric = Number(`${negative || negativeByParens ? "-" : ""}${normalized}`);
  if (!Number.isFinite(numeric) || numeric === 0) return null;
  return Math.round(numeric * 100) / 100;
};

const parseLocalizedAmount = (value: string): number | null => {
  const numeric = parseSignedLocalizedAmount(value);
  if (numeric === null || numeric <= 0) return null;
  return numeric;
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

const parseDateValue = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month}-${day}`;
  }

  const compactIsoMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactIsoMatch) {
    const [, year, month, day] = compactIsoMatch;
    return `${year}-${month}-${day}`;
  }

  const cleaned = trimmed.split(" ")[0]?.trim() ?? trimmed;
  const parts = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!parts) return null;

  let first = Number(parts[1]);
  let second = Number(parts[2]);
  let year = Number(parts[3]);

  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }

  let day = first;
  let month = second;
  if (first <= 12 && second > 12) {
    day = second;
    month = first;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const csvDelimiters = [",", ";", "\t", "|"] as const;

const parseCsvRows = (text: string, delimiter: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";

    if (char === "\"") {
      const next = text[index + 1] ?? "";
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row);
  }

  return rows
    .map((cells) => cells.map((value) => value.replace(/^\uFEFF/, "").trim()))
    .filter((cells) => cells.some((value) => value.length > 0));
};

const detectDelimiter = (text: string): string => {
  let bestDelimiter = ",";
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const delimiter of csvDelimiters) {
    const rows = parseCsvRows(text, delimiter).slice(0, 12);
    if (rows.length === 0) continue;

    const widths = rows.map((row) => row.length);
    const multiColumnRows = widths.filter((width) => width > 1).length;
    const avgWidth = widths.reduce((sum, width) => sum + width, 0) / widths.length;
    const variance =
      widths.reduce((sum, width) => sum + (width - avgWidth) ** 2, 0) / widths.length;
    const score = multiColumnRows * 20 + avgWidth - variance;

    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
};

const headerAliases = {
  date: [
    "date",
    "booking date",
    "booked",
    "posted date",
    "value date",
    "transaction date",
    "dato",
    "transaktionsdato",
    "bogforingsdato",
    "foringsdato",
    "valutadato",
  ],
  amount: ["amount", "belob", "beløb", "sum", "value", "net amount", "transaction amount"],
  debit: ["debit", "withdrawal", "outflow", "debet", "paid out", "ud"],
  credit: ["credit", "deposit", "inflow", "kredit", "paid in", "ind"],
  currency: ["currency", "valuta", "ccy"],
  balance: ["balance", "saldo", "running balance", "available balance"],
  description: [
    "description",
    "details",
    "text",
    "memo",
    "narrative",
    "merchant",
    "payee",
    "counterparty",
    "recipient",
    "sender",
    "beskrivelse",
    "tekst",
    "navn",
  ],
  reference: ["reference", "message", "note", "comment", "remittance", "info", "reference text"],
  direction: ["type", "direction", "transaction type", "entry type"],
} as const;

type HeaderSemantic = keyof typeof headerAliases;

const scoreHeaderForSemantic = (header: string, semantic: HeaderSemantic): number => {
  const normalized = normalizeHeaderKey(header);
  if (!normalized) return 0;

  let best = 0;
  for (const alias of headerAliases[semantic]) {
    if (normalized === alias) best = Math.max(best, 100);
    else if (normalized.startsWith(alias) || normalized.endsWith(alias)) best = Math.max(best, 70);
    else if (normalized.includes(alias)) best = Math.max(best, 45);
  }
  return best;
};

const inferHeaderRowIndex = (rows: string[][]): number => {
  let bestIndex = -1;
  let bestScore = 0;

  for (let index = 0; index < Math.min(rows.length, 8); index += 1) {
    const row = rows[index] ?? [];
    const semanticHits = new Set<HeaderSemantic>();

    for (const cell of row) {
      for (const semantic of Object.keys(headerAliases) as HeaderSemantic[]) {
        if (scoreHeaderForSemantic(cell, semantic) > 0) {
          semanticHits.add(semantic);
        }
      }
    }

    const nonEmpty = row.filter((cell) => cell.trim().length > 0).length;
    const numericLike = row.filter((cell) => parseSignedLocalizedAmount(cell) !== null || parseDateValue(cell) !== null).length;
    const score = semanticHits.size * 10 + nonEmpty - numericLike * 3;

    if (semanticHits.size >= 2 && score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
};

const findBestColumnIndex = (
  headers: string[],
  semantics: HeaderSemantic[],
  excluded: Set<number> = new Set(),
): number => {
  let bestIndex = -1;
  let bestScore = 0;

  for (let index = 0; index < headers.length; index += 1) {
    if (excluded.has(index)) continue;
    const score = Math.max(...semantics.map((semantic) => scoreHeaderForSemantic(headers[index] ?? "", semantic)));
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestScore > 0 ? bestIndex : -1;
};

const looksLikeNoiseDescription = (value: string): boolean => {
  const normalized = normalizeHeaderKey(value);
  if (!normalized) return true;
  return [
    "opening balance",
    "closing balance",
    "running balance",
    "available balance",
    "saldo",
    "total",
    "subtotal",
    "balance",
  ].some((noise) => normalized.includes(noise));
};

const inferKindFromDirection = (value: string): "expense" | "income" | null => {
  const normalized = normalizeHeaderKey(value);
  if (!normalized) return null;
  if (
    ["credit", "deposit", "incoming", "received", "in", "kredit"].some((part) => normalized.includes(part))
  ) {
    return "income";
  }
  if (
    ["debit", "withdrawal", "outgoing", "sent", "out", "debet"].some((part) => normalized.includes(part))
  ) {
    return "expense";
  }
  return null;
};

const inferTransactionsHeuristically = (
  csvText: string,
  fallbackDate: string,
): ParsedTransaction[] => {
  const delimiter = detectDelimiter(csvText);
  const rows = parseCsvRows(csvText, delimiter);
  const headerRowIndex = inferHeaderRowIndex(rows);
  if (rows.length < 2 || headerRowIndex < 0 || headerRowIndex >= rows.length - 1) {
    console.info("[parse-transaction-csv] Heuristic parser could not infer a usable header row.", {
      rowCount: rows.length,
      headerRowIndex,
      delimiter,
    });
    return [];
  }

  const headers = rows[headerRowIndex] ?? [];
  const dataRows = rows.slice(headerRowIndex + 1);
  const excluded = new Set<number>();
  const dateIndex = findBestColumnIndex(headers, ["date"], excluded);
  if (dateIndex >= 0) excluded.add(dateIndex);
  const debitIndex = findBestColumnIndex(headers, ["debit"], excluded);
  if (debitIndex >= 0) excluded.add(debitIndex);
  const creditIndex = findBestColumnIndex(headers, ["credit"], excluded);
  if (creditIndex >= 0) excluded.add(creditIndex);
  const amountIndex = findBestColumnIndex(headers, ["amount"], excluded);
  if (amountIndex >= 0) excluded.add(amountIndex);
  const currencyIndex = findBestColumnIndex(headers, ["currency"]);
  const directionIndex = findBestColumnIndex(headers, ["direction"]);

  const preferredDescriptionIndexes = headers
    .map((header, index) => ({ index, score: Math.max(scoreHeaderForSemantic(header, "description"), scoreHeaderForSemantic(header, "reference")) }))
    .filter(({ score, index }) => score > 0 && index !== dateIndex && index !== amountIndex && index !== debitIndex && index !== creditIndex)
    .sort((left, right) => right.score - left.score)
    .map(({ index }) => index);

  const fallbackDescriptionIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter(({ index, header }) =>
      index !== dateIndex &&
      index !== amountIndex &&
      index !== debitIndex &&
      index !== creditIndex &&
      index !== currencyIndex &&
      scoreHeaderForSemantic(header, "balance") === 0,
    )
    .map(({ index }) => index);

  const descriptionIndexes = [...new Set([...preferredDescriptionIndexes, ...fallbackDescriptionIndexes])].slice(0, 3);

  console.info("[parse-transaction-csv] Heuristic parser inferred CSV structure.", {
    delimiter,
    rowCount: rows.length,
    headerRowIndex,
    headers,
    dateIndex,
    amountIndex,
    debitIndex,
    creditIndex,
    currencyIndex,
    directionIndex,
    descriptionIndexes,
  });

  const transactions: ParsedTransaction[] = [];
  for (const row of dataRows) {
    const occurredOn = dateIndex >= 0 ? parseDateValue(row[dateIndex] ?? "") : null;
    if (!occurredOn) continue;

    const debit = debitIndex >= 0 ? parseLocalizedAmount(row[debitIndex] ?? "") : null;
    const credit = creditIndex >= 0 ? parseLocalizedAmount(row[creditIndex] ?? "") : null;
    const signedAmount = amountIndex >= 0 ? parseSignedLocalizedAmount(row[amountIndex] ?? "") : null;

    let amount: number | null = null;
    let kind: "expense" | "income" | null = null;

    if (debit !== null && credit === null) {
      amount = debit;
      kind = "expense";
    } else if (credit !== null && debit === null) {
      amount = credit;
      kind = "income";
    } else if (debit !== null && credit !== null) {
      if (credit > debit) {
        amount = credit - debit;
        kind = "income";
      } else if (debit > credit) {
        amount = debit - credit;
        kind = "expense";
      }
    } else if (signedAmount !== null) {
      amount = Math.abs(signedAmount);
      kind = signedAmount < 0 ? "expense" : "income";
    }

    if (amount === null || !kind) {
      const directionKind = directionIndex >= 0 ? inferKindFromDirection(row[directionIndex] ?? "") : null;
      if (signedAmount !== null && directionKind) {
        amount = Math.abs(signedAmount);
        kind = directionKind;
      }
    }

    if (amount === null || !kind || amount <= 0) continue;

    const nameParts = descriptionIndexes
      .map((index) => row[index] ?? "")
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && !looksLikeNoiseDescription(value));
    const name = nameParts[0] ?? "";
    if (!name) continue;

    const comment = nameParts.slice(1).join(" · ") || null;
    const currencyCode =
      currencyIndex >= 0
        ? normalizeCurrencyCode(row[currencyIndex] ?? "")
        : "DKK";

    transactions.push({
      kind,
      name,
      amount: Math.round(amount * 100) / 100,
      currencyCode,
      categoryId: null,
      comment,
      occurredOn: normalizeDate(occurredOn, fallbackDate),
    });
  }

  return transactions;
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
  const heuristicTransactions = inferTransactionsHeuristically(csvText, today);
  if (heuristicTransactions.length > 0) {
    console.info("[parse-transaction-csv] Returning heuristic CSV parse result.", {
      count: heuristicTransactions.length,
    });
    return json({ transactions: heuristicTransactions });
  }

  const candidateList = candidates
    .map((candidate, index) => `${index + 1}. ${candidate.parent} / ${candidate.name} [${candidate.id}]`)
    .join("\n");

  const prompt = [
    "You are parsing a bank statement CSV into actual app transactions.",
    "Read the CSV carefully and create one transaction per completed statement row.",
    "Ignore balance-only rows, opening/closing balance rows, headers, totals, empty lines, and duplicate summary rows.",
    "Bank CSVs may use comma, semicolon, tab, or pipe delimiters.",
    "Dates may be ISO, DD/MM/YYYY, DD-MM-YYYY, or similar localized formats.",
    "Amounts may be signed in one column or split into debit and credit columns.",
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

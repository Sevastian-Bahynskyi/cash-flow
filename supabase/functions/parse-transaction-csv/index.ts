import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  normalizeMerchantContext,
  resolveCuratedCategoryId,
  type Candidate,
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
  rawText: string | null;
  message: string | null;
  transactionType: string | null;
  sender: string | null;
  receiver: string | null;
  bankCategory: string | null;
  normalizedMerchant: string | null;
  suggestedSharedTopup: boolean;
  categorySource: "curated" | "llm" | null;
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

const normalizeNullableText = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
};

const normalizeName = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
};

const normalizePersonCandidate = (value: string): string[] =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z'\- ]+/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

const looksLikePersonName = (value: string | null): boolean => {
  if (!value) return false;
  const parts = normalizePersonCandidate(value);
  return parts.length >= 2 && parts.length <= 4 && parts.every((part) => /^[A-Za-z][A-Za-z'-]*$/.test(part));
};

const toTitleCaseName = (value: string): string =>
  normalizePersonCandidate(value)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1).toLowerCase()}`)
    .join(" ");

const mentionMobilePay = (value: string | null | undefined): boolean =>
  /\bmobilepay\b|\bmob pay\b|\bmp\b/i.test(String(value ?? ""));

const extractMobilePayNameFromText = (value: string): string | null => {
  const stripped = value
    .replace(/\bmobile\s*pay\b/gi, " ")
    .replace(/\bmob\.?\s*pay\b/gi, " ")
    .replace(/\bmp\b/gi, " ")
    .replace(/\boverforsel\b/gi, " ")
    .replace(/\boverfoersel\b/gi, " ")
    .replace(/\btransfer\b/gi, " ")
    .trim();
  return looksLikePersonName(stripped) ? toTitleCaseName(stripped) : null;
};

const resolveImportedName = ({
  kind,
  fallbackName,
  rawText,
  message,
  sender,
  receiver,
}: {
  kind: "expense" | "income";
  fallbackName: string;
  rawText?: string | null;
  message?: string | null;
  sender?: string | null;
  receiver?: string | null;
}): string => {
  const rawName = normalizeName(fallbackName) ?? "Imported transaction";
  if (!mentionMobilePay(rawText) && !mentionMobilePay(message) && !mentionMobilePay(fallbackName)) {
    return rawName;
  }

  const directCounterparty = kind === "income" ? sender : receiver;
  if (looksLikePersonName(directCounterparty ?? null)) {
    return toTitleCaseName(directCounterparty ?? "");
  }

  return (
    extractMobilePayNameFromText(rawText ?? "") ??
    extractMobilePayNameFromText(message ?? "") ??
    rawName
  );
};

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

  const parts = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!parts) return null;

  let day = Number(parts[1]);
  let month = Number(parts[2]);
  let year = Number(parts[3]);

  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }

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

const normalizeHeaderKey = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const parseBankExport = (
  csvText: string,
  fallbackDate: string,
  candidates: readonly Candidate[],
): ParsedTransaction[] => {
  const rows = parseCsvRows(csvText, detectDelimiter(csvText));
  const headers = rows[0] ?? [];
  const normalizedHeaders = headers.map(normalizeHeaderKey);
  const requiredHeaders = [
    "date",
    "date of posting",
    "text",
    "message",
    "transaction type",
    "amount",
    "currency",
    "sender",
    "receiver",
    "note",
    "category",
  ];

  if (!requiredHeaders.every((header) => normalizedHeaders.includes(header))) {
    return [];
  }

  const headerIndex = new Map(headers.map((header, index) => [normalizeHeaderKey(header), index]));
  const bodyRows = rows.slice(1);
  const parsed: ParsedTransaction[] = [];

  for (const row of bodyRows) {
    const rawText = row[headerIndex.get("text") ?? -1] ?? "";
    const amountRaw = row[headerIndex.get("amount") ?? -1] ?? "";
    const occurredOnRaw = row[headerIndex.get("date") ?? -1] ?? row[headerIndex.get("date of posting") ?? -1] ?? "";
    const signedAmount = parseSignedLocalizedAmount(amountRaw);
    if (!rawText.trim() || signedAmount === null) continue;

    const kind = signedAmount < 0 ? "expense" : "income";
    const amount = Math.round(Math.abs(signedAmount) * 100) / 100;
    const message = normalizeNullableText(row[headerIndex.get("message") ?? -1] ?? "");
    const note = normalizeNullableText(row[headerIndex.get("note") ?? -1] ?? "");
    const transactionType = normalizeNullableText(row[headerIndex.get("transaction type") ?? -1] ?? "");
    const sender = normalizeNullableText(row[headerIndex.get("sender") ?? -1] ?? "");
    const receiver = normalizeNullableText(row[headerIndex.get("receiver") ?? -1] ?? "");
    const bankCategory = normalizeNullableText(row[headerIndex.get("category") ?? -1] ?? "");
    const occurredOn = normalizeDate(parseDateValue(occurredOnRaw), fallbackDate);
    const currencyCode = normalizeCurrencyCode(row[headerIndex.get("currency") ?? -1] ?? "");
    const normalizedMerchant = normalizeMerchantContext({
      kind,
      name: rawText,
      comment: note,
      rawText,
      message,
      sender,
    });
    const deterministicCurated = resolveCuratedCategoryId({
      context: {
        kind,
        name: rawText,
        comment: note,
        rawText,
        message,
        sender,
      },
      candidates,
    });

    parsed.push({
      kind,
      name: resolveImportedName({
        kind,
        fallbackName: rawText,
        rawText,
        message,
        sender,
        receiver,
      }),
      amount,
      currencyCode,
      categoryId: deterministicCurated?.categoryId ?? null,
      comment: [note, message].filter(Boolean).join(" · ") || null,
      occurredOn,
      rawText,
      message,
      transactionType,
      sender,
      receiver,
      bankCategory,
      normalizedMerchant: normalizedMerchant || null,
      suggestedSharedTopup: kind === "expense" && normalizedMerchant === "revolut",
      categorySource: deterministicCurated ? "curated" : null,
    });
  }

  return parsed;
};

const headerAliases = {
  date: ["date", "booking date", "booked", "posted date", "value date", "transaction date", "dato"],
  amount: ["amount", "belob", "beløb", "sum", "value", "net amount", "transaction amount"],
  debit: ["debit", "withdrawal", "outflow", "debet", "paid out", "ud"],
  credit: ["credit", "deposit", "inflow", "kredit", "paid in", "ind"],
  currency: ["currency", "valuta", "ccy"],
  balance: ["balance", "saldo", "running balance", "available balance"],
  description: ["description", "details", "text", "memo", "merchant", "payee", "counterparty", "recipient", "sender"],
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

const inferKindFromDirection = (value: string): "expense" | "income" | null => {
  const normalized = normalizeHeaderKey(value);
  if (!normalized) return null;
  if (["credit", "deposit", "incoming", "received", "in", "kredit"].some((part) => normalized.includes(part))) {
    return "income";
  }
  if (["debit", "withdrawal", "outgoing", "sent", "out", "debet"].some((part) => normalized.includes(part))) {
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

  const descriptionIndexes = headers
    .map((header, index) => ({
      index,
      score: Math.max(scoreHeaderForSemantic(header, "description"), scoreHeaderForSemantic(header, "reference")),
    }))
    .filter(({ score, index }) => score > 0 && !excluded.has(index))
    .sort((left, right) => right.score - left.score)
    .map(({ index }) => index)
    .slice(0, 3);

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
    } else if (signedAmount !== null) {
      amount = Math.abs(signedAmount);
      kind = signedAmount < 0 ? "expense" : "income";
    } else {
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
      .filter(Boolean);
    const name = nameParts[0] ?? "";
    if (!name) continue;

    const comment = nameParts.slice(1).join(" · ") || null;
    const normalizedMerchant = normalizeMerchantContext({ kind, name, comment });

    transactions.push({
      kind,
      name: resolveImportedName({
        kind,
        fallbackName: name,
        rawText: name,
        message: comment,
        sender: null,
        receiver: null,
      }),
      amount: Math.round(amount * 100) / 100,
      currencyCode: currencyIndex >= 0 ? normalizeCurrencyCode(row[currencyIndex] ?? "") : "DKK",
      categoryId: null,
      comment,
      occurredOn: normalizeDate(occurredOn, fallbackDate),
      rawText: name,
      message: null,
      transactionType: directionIndex >= 0 ? normalizeNullableText(row[directionIndex] ?? "") : null,
      sender: null,
      receiver: null,
      bankCategory: null,
      normalizedMerchant: normalizedMerchant || null,
      suggestedSharedTopup: kind === "expense" && normalizedMerchant === "revolut",
      categorySource: null,
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
      const rawText = normalizeNullableText(objectRow.rawText) ?? name;
      const message = normalizeNullableText(objectRow.message);
      const comment = normalizeNullableText(objectRow.comment);
      const normalizedMerchant = normalizeMerchantContext({
        kind,
        name,
        comment,
        rawText,
        message,
        sender: normalizeNullableText(objectRow.sender),
      });

      return {
        kind,
        name: resolveImportedName({
          kind,
          fallbackName: name,
          rawText,
          message,
          sender: normalizeNullableText(objectRow.sender),
          receiver: normalizeNullableText(objectRow.receiver),
        }),
        amount,
        currencyCode: normalizeCurrencyCode(objectRow.currencyCode),
        categoryId,
        comment,
        occurredOn: normalizeDate(objectRow.occurredOn, fallbackDate),
        rawText,
        message,
        transactionType: normalizeNullableText(objectRow.transactionType),
        sender: normalizeNullableText(objectRow.sender),
        receiver: normalizeNullableText(objectRow.receiver),
        bankCategory: normalizeNullableText(objectRow.bankCategory),
        normalizedMerchant: normalizedMerchant || null,
        suggestedSharedTopup:
          typeof objectRow.suggestedSharedTopup === "boolean"
            ? objectRow.suggestedSharedTopup
            : kind === "expense" && normalizedMerchant === "revolut",
        categorySource: categoryId ? "llm" : null,
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
    return errorJson("Unauthorized", 401);
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: anonKey,
    },
  }).catch(() => null);
  if (!authResponse?.ok) {
    return errorJson("Unauthorized", 401);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return errorJson("Invalid request body", 400);
  }

  const csvText = typeof body.csvText === "string" ? trimCsv(body.csvText) : "";
  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const today = typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : "1970-01-01";

  if (!csvText || candidates.length === 0) {
    return errorJson("CSV contents and category options are required", 400);
  }

  const bankExportTransactions = parseBankExport(csvText, today, candidates);
  if (bankExportTransactions.length > 0) {
    console.info("[parse-transaction-csv] Parsed dedicated bank export format.", {
      count: bankExportTransactions.length,
      fileName,
    });
    return json({ transactions: bankExportTransactions });
  }

  const heuristicTransactions = inferTransactionsHeuristically(csvText, today);
  if (heuristicTransactions.length > 0) {
    console.info("[parse-transaction-csv] Returning heuristic CSV parse result.", {
      count: heuristicTransactions.length,
      fileName,
    });
    return json({ transactions: heuristicTransactions });
  }

  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) {
    return errorJson("AI provider is not configured", 503);
  }

  const candidateList = candidates
    .map((candidate, index) => `${index + 1}. ${candidate.parent} / ${candidate.name} [${candidate.id}]`)
    .join("\n");
  const validCategoryIds = new Set(candidates.map((candidate) => candidate.id));

  const prompt = [
    "You are parsing a bank statement CSV into app transactions.",
    "Prefer deterministic extraction from the CSV. Do not invent rows or aggregate balances.",
    "Return strict JSON only with this shape:",
    '{"transactions":[{"kind":"expense","name":"string","amount":12.34,"currencyCode":"DKK","categoryId":"uuid-or-null","comment":"string-or-null","occurredOn":"YYYY-MM-DD","rawText":"string-or-null","message":"string-or-null","transactionType":"string-or-null","sender":"string-or-null","receiver":"string-or-null","bankCategory":"string-or-null","suggestedSharedTopup":false}]}',
    "If the expense category is unclear, return null for categoryId.",
    "If the row is an obvious salary, interest, benefit, or transfer income, you may set categoryId.",
    "For person-to-person MobilePay transfers, prefer the actual counterparty person name as name instead of a generic MobilePay label.",
    "Keep rawText equal to the bank's original merchant/description text when available.",
    `Fallback date: ${today}`,
    fileName ? `Filename: ${fileName}` : "Filename: unknown.csv",
    `Candidate categories:\n${candidateList}`,
    "CSV contents:",
    csvText,
  ].join("\n\n");

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0,
        max_tokens: 1600,
        messages: [
          {
            role: "system",
            content:
              'Return strict JSON only in the shape {"transactions":[{"kind":"expense","name":"string","amount":12.34,"currencyCode":"DKK","categoryId":"uuid-or-null","comment":"string-or-null","occurredOn":"YYYY-MM-DD","rawText":"string-or-null","message":"string-or-null","transactionType":"string-or-null","sender":"string-or-null","receiver":"string-or-null","bankCategory":"string-or-null","suggestedSharedTopup":false}]}.',
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
    return json({ transactions });
  } catch (error) {
    console.error("[parse-transaction-csv] Unexpected Groq error.", error);
    return errorJson("AI provider request failed", 502);
  }
});

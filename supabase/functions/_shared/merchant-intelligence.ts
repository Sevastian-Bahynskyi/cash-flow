export type TransactionKind = "expense" | "income";

export type MerchantSuggestionContext = {
  kind: TransactionKind;
  name: string;
  comment?: string | null;
  rawText?: string | null;
  message?: string | null;
  sender?: string | null;
};

const translationMap: Record<string, string> = {
  æ: "ae",
  ø: "o",
  å: "a",
};

const companySuffixTokens = new Set([
  "a",
  "ab",
  "aps",
  "as",
  "corp",
  "dk",
  "eu",
  "gmbh",
  "inc",
  "limited",
  "ltd",
  "oy",
  "s",
  "sa",
  "se",
]);

const trailingNoiseTokens = new Set([
  "app",
  "bill",
  "com",
  "denmark",
  "dk",
  "horsens",
  "payments",
  "sweden",
  "web",
]);

const merchantAliases = [
  { canonical: "apple", patterns: [/\bapple\b/, /\bapple com bill\b/, /\bitunes\b/] },
  { canonical: "banken food hall", patterns: [/\bbanken food hall\b/, /\blivet i byen\b/] },
  { canonical: "bilka", patterns: [/\bbilka\b/] },
  { canonical: "claude", patterns: [/\bclaude\b/] },
  { canonical: "coop 365", patterns: [/\bcoop ?365\b/, /\bcoop365discount\b/] },
  { canonical: "dazn", patterns: [/\bdazn\b/] },
  { canonical: "disney", patterns: [/\bdisney\b/] },
  { canonical: "dsb", patterns: [/\bdsb\b/] },
  { canonical: "easy park", patterns: [/\beasy ?park\b/] },
  { canonical: "f24", patterns: [/\bf24\b/] },
  { canonical: "fakta", patterns: [/\bfakta\b/] },
  { canonical: "fitness world", patterns: [/\bfitness world\b/] },
  { canonical: "fitnessx", patterns: [/\bfitnessx\b/] },
  { canonical: "fotex", patterns: [/\bfotex\b/, /\bfoetex\b/] },
  { canonical: "if", patterns: [/^if\b/, /\bif forsikring\b/] },
  { canonical: "ingo", patterns: [/\bingo\b/] },
  { canonical: "interest", patterns: [/\binterest\b/] },
  { canonical: "kiwi.com", patterns: [/\bkiwi\b/] },
  { canonical: "lebara", patterns: [/\blebara\b/] },
  { canonical: "lidl", patterns: [/\blidl\b/] },
  { canonical: "lyca mobile", patterns: [/\blyca\b/] },
  { canonical: "matas", patterns: [/\bmatas\b/] },
  { canonical: "mcdonalds", patterns: [/\bmcdonalds\b/, /\bmcd\b/] },
  { canonical: "midttrafik", patterns: [/\bmidttrafik\b/] },
  { canonical: "mono", patterns: [/\bmono\b/, /\bmonobank\b/] },
  { canonical: "netto", patterns: [/\bnetto\b/] },
  { canonical: "normal", patterns: [/\bnormal\b/] },
  { canonical: "oister", patterns: [/\boister\b/, /\boi ster\b/] },
  { canonical: "ok", patterns: [/\bok\b/, /\bok amba\b/] },
  { canonical: "puregym", patterns: [/\bpuregym\b/] },
  { canonical: "q8", patterns: [/\bq8\b/] },
  { canonical: "rejsekort", patterns: [/\brejsekort\b/] },
  { canonical: "rema 1000", patterns: [/\brema ?1000\b/] },
  { canonical: "revolut", patterns: [/\brevolut\b/] },
  { canonical: "spotify", patterns: [/\bspotify\b/] },
  { canonical: "steam", patterns: [/\bsteam\b/] },
  { canonical: "su", patterns: [/\bsu\b/] },
  { canonical: "transfergo", patterns: [/\btransfergo\b/] },
  { canonical: "tryg", patterns: [/\btryg\b/] },
  { canonical: "wolt", patterns: [/\bwolt\b/] },
  { canonical: "zalando", patterns: [/\bzalando\b/] },
];

export const normalizeAsciiText = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[æøå]/gi, (char) => translationMap[char.toLowerCase()] ?? char)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripPaymentRails = (value: string): string =>
  value
    .replace(/\bmobile\s*pay\b/gi, " ")
    .replace(/\bmob\.?\s*pay\b/gi, " ")
    .replace(/\bmp\b/gi, " ");

const stripBankNoise = (value: string): string =>
  value
    .replace(/\bvisa\b/gi, " ")
    .replace(/\bmastercard\b/gi, " ")
    .replace(/\bdebit\b/gi, " ")
    .replace(/\bcredit\b/gi, " ")
    .replace(/\bcard\b/gi, " ")
    .replace(/\bwww\./gi, " ")
    .replace(/\bhttps?:/gi, " ");

const splitRawSegments = (value: string): string[] =>
  value
    .split(/(?:\s[-–—]\s|[*|/]|:\s+)/g)
    .map((segment) => segment.trim())
    .filter(Boolean);

const collapseRepeatedTokens = (tokens: string[]): string[] => {
  if (tokens.length >= 2 && tokens.length % 2 === 0) {
    const half = tokens.length / 2;
    const left = tokens.slice(0, half).join(" ");
    const right = tokens.slice(half).join(" ");
    if (left === right) {
      return tokens.slice(0, half);
    }
  }

  const out: string[] = [];
  for (const token of tokens) {
    if (out[out.length - 1] === token) continue;
    out.push(token);
  }
  return out;
};

const trimTrailingNoiseTokens = (tokens: string[]): string[] => {
  const next = [...tokens];
  while (next.length > 1) {
    const tail = next[next.length - 1] ?? "";
    if (/^\d+$/.test(tail) || companySuffixTokens.has(tail) || trailingNoiseTokens.has(tail)) {
      next.pop();
      continue;
    }
    break;
  }
  return next;
};

const normalizeMerchantSegment = (value: string): string => {
  const normalized = normalizeAsciiText(stripBankNoise(stripPaymentRails(value)));
  if (!normalized) return "";
  const collapsed = collapseRepeatedTokens(normalized.split(" "));
  return trimTrailingNoiseTokens(collapsed).join(" ").trim();
};

const findCanonicalMerchant = (normalizedText: string): string | null => {
  for (const alias of merchantAliases) {
    if (alias.patterns.some((pattern) => pattern.test(normalizedText))) {
      return alias.canonical;
    }
  }
  return null;
};

export const normalizeMerchantContext = (context: MerchantSuggestionContext): string => {
  const joined = [context.rawText ?? context.name, context.message ?? "", context.comment ?? ""]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  const normalizedWhole = normalizeMerchantSegment(joined);
  const canonicalWhole = findCanonicalMerchant(normalizedWhole);
  if (canonicalWhole) return canonicalWhole;

  const segments = splitRawSegments(joined)
    .map(normalizeMerchantSegment)
    .filter(Boolean);

  for (const segment of segments) {
    const canonicalSegment = findCanonicalMerchant(segment);
    if (canonicalSegment) return canonicalSegment;
  }

  return segments[0] ?? normalizedWhole;
};

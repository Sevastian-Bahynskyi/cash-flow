export type TransactionKind = "expense" | "income";

export type Candidate = {
  id: string;
  parent: string;
  name: string;
  icon?: string;
};

export type MerchantSuggestionContext = {
  kind: TransactionKind;
  name: string;
  comment?: string | null;
  rawText?: string | null;
  message?: string | null;
  sender?: string | null;
};

type CategoryPath = {
  parent: string;
  name: string;
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

const incomeSalaryPaths: readonly CategoryPath[] = [{ parent: "Income", name: "Salary" }];
const incomeInterestPaths: readonly CategoryPath[] = [{ parent: "Income", name: "Interest" }];
const incomeBenefitsPaths: readonly CategoryPath[] = [{ parent: "Income", name: "Benefits" }];
const transferPaths: readonly CategoryPath[] = [{ parent: "Transfers", name: "Transfer" }];
const parkingPaths: readonly CategoryPath[] = [{ parent: "Transport", name: "Parking" }];
const phonePaths: readonly CategoryPath[] = [{ parent: "Household", name: "Phone" }];
const insurancePaths: readonly CategoryPath[] = [{ parent: "Household", name: "Insurance" }];
const fuelPaths: readonly CategoryPath[] = [{ parent: "Transport", name: "Fuel" }];
const publicTransitPaths: readonly CategoryPath[] = [{ parent: "Transport", name: "Public transit" }];
const restaurantsPaths: readonly CategoryPath[] = [{ parent: "Food", name: "Restaurants" }];
const groceriesPaths: readonly CategoryPath[] = [{ parent: "Food", name: "Groceries" }];
const subscriptionsPaths: readonly CategoryPath[] = [{ parent: "Entertainment", name: "Subscriptions" }];
const fitnessPaths: readonly CategoryPath[] = [{ parent: "Health", name: "Fitness" }];
const personalCarePaths: readonly CategoryPath[] = [{ parent: "Shopping", name: "Personal care" }];
const travelPaths: readonly CategoryPath[] = [{ parent: "Entertainment", name: "Travel" }];

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

const curatedCategories = {
  apple: { expense: subscriptionsPaths },
  "banken food hall": { expense: restaurantsPaths },
  bilka: { expense: groceriesPaths },
  claude: { expense: subscriptionsPaths },
  "coop 365": { expense: groceriesPaths },
  dazn: { expense: subscriptionsPaths },
  disney: { expense: subscriptionsPaths },
  dsb: { expense: publicTransitPaths },
  "easy park": { expense: parkingPaths },
  f24: { expense: fuelPaths },
  fakta: { expense: groceriesPaths },
  "fitness world": { expense: fitnessPaths },
  fitnessx: { expense: fitnessPaths },
  fotex: { expense: groceriesPaths },
  if: { expense: insurancePaths },
  ingo: { expense: fuelPaths },
  interest: { income: incomeInterestPaths },
  "kiwi.com": { expense: travelPaths },
  lebara: { expense: phonePaths },
  lidl: { expense: groceriesPaths },
  "lyca mobile": { expense: phonePaths },
  matas: { expense: personalCarePaths },
  mcdonalds: { expense: restaurantsPaths },
  midttrafik: { expense: publicTransitPaths },
  mono: { expense: transferPaths },
  netto: { expense: groceriesPaths },
  normal: { expense: personalCarePaths },
  oister: { expense: phonePaths },
  ok: { expense: fuelPaths },
  puregym: { expense: fitnessPaths },
  q8: { expense: fuelPaths },
  rejsekort: { expense: publicTransitPaths },
  "rema 1000": { expense: groceriesPaths },
  revolut: { expense: transferPaths, income: transferPaths },
  spotify: { expense: subscriptionsPaths },
  steam: { expense: [{ parent: "Entertainment", name: "Games" }] },
  su: { income: incomeBenefitsPaths },
  transfergo: { expense: transferPaths, income: transferPaths },
  tryg: { expense: insurancePaths },
  wolt: { expense: restaurantsPaths },
  zalando: { expense: [{ parent: "Shopping", name: "Clothes" }] },
};

const normalizeCategoryName = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, "");

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

const findCategoryId = (
  candidates: readonly Candidate[],
  paths: readonly CategoryPath[],
): string | null => {
  for (const path of paths) {
    const match = candidates.find(
      (candidate) =>
        normalizeCategoryName(candidate.parent) === normalizeCategoryName(path.parent) &&
        normalizeCategoryName(candidate.name) === normalizeCategoryName(path.name),
    );
    if (match) return match.id;
  }
  return null;
};

const isSalaryLike = (normalizedMerchant: string, sender: string): boolean =>
  /\blonoverforsel\b|\blonoverfoersel\b|\bsalary\b/.test(normalizedMerchant) ||
  /\bbeumer group\b|\buniwelco\b/.test(sender);

const isBenefitsLike = (normalizedMerchant: string, sender: string): boolean =>
  normalizedMerchant === "su" || /\buddannelses og forsknings\b/.test(sender);

export const resolveCuratedCategoryId = ({
  context,
  candidates,
}: {
  context: MerchantSuggestionContext;
  candidates: readonly Candidate[];
}): { categoryId: string; confidence: number; normalizedMerchant: string } | null => {
  const normalizedMerchant = normalizeMerchantContext(context);
  const normalizedSender = normalizeAsciiText(context.sender ?? "");

  if (context.kind === "income") {
    if (isSalaryLike(normalizedMerchant, normalizedSender)) {
      const categoryId = findCategoryId(candidates, incomeSalaryPaths);
      if (categoryId) return { categoryId, confidence: 0.99, normalizedMerchant };
    }

    if (isBenefitsLike(normalizedMerchant, normalizedSender)) {
      const categoryId = findCategoryId(candidates, incomeBenefitsPaths);
      if (categoryId) return { categoryId, confidence: 0.99, normalizedMerchant };
    }

    if (normalizedMerchant === "interest") {
      const categoryId = findCategoryId(candidates, incomeInterestPaths);
      if (categoryId) return { categoryId, confidence: 0.99, normalizedMerchant };
    }
  }

  const definition = curatedCategories[normalizedMerchant as keyof typeof curatedCategories] as
    | { expense?: readonly CategoryPath[]; income?: readonly CategoryPath[] }
    | undefined;
  const paths = context.kind === "income" ? definition?.income : definition?.expense;
  if (!paths?.length) return null;

  const categoryId = findCategoryId(candidates, paths);
  if (!categoryId) return null;
  return { categoryId, confidence: 0.98, normalizedMerchant };
};

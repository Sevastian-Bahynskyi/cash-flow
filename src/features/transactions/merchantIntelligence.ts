import { normalizeTransferPersonName } from '@/features/transfers/people';
import type { TransactionKind } from './types';

export type MerchantCategoryCandidate = {
  id: string;
  parent: string;
  name: string;
  icon?: string;
};

export type MerchantCategorySource = 'rule' | 'memory_exact' | 'memory_fuzzy' | 'transfer_person' | 'ai';

export type MerchantSuggestionContext = {
  kind: TransactionKind;
  name: string;
  comment?: string | null;
  rawText?: string | null;
  message?: string | null;
  transactionType?: string | null;
  sender?: string | null;
  receiver?: string | null;
  bankCategory?: string | null;
};

export type RankedMerchantCategoryCandidate = {
  categoryId: string;
  source: 'rule' | 'memory_exact' | 'memory_fuzzy';
  confidence: number;
  normalizedMerchant: string;
  canonicalMerchant: string | null;
  isSharedTopup: boolean;
  matchedPattern: string | null;
  similarity: number | null;
  observationCount: number | null;
  supportRatio: number | null;
  priority: number | null;
};

export type MerchantCategorySuggestion = {
  categoryId: string;
  confidence: number;
  source: Exclude<MerchantCategorySource, 'ai'>;
  normalizedMerchant: string;
  canonicalMerchant: string | null;
  isSharedTopup: boolean;
};

type CategoryPath = {
  parent: string;
  name: string;
};

type MerchantAliasDefinition = {
  canonical: string;
  patterns: readonly RegExp[];
};

type CuratedCategoryDefinition = {
  canonical: string;
  expense?: readonly CategoryPath[];
  income?: readonly CategoryPath[];
  confidence: number;
  isSharedTopup?: boolean;
};

const translationMap: Record<string, string> = {
  æ: 'ae',
  ø: 'o',
  å: 'a',
};

const genericMerchantValues = new Set([
  '',
  'account',
  'betaling',
  'betalingkort',
  'betalingsterminal',
  'bank',
  'bank transfer',
  'card',
  'charge',
  'direct debit',
  'mobilepay',
  'mob pay',
  'payment',
  'transfer',
]);

const companySuffixTokens = new Set([
  'a',
  'ab',
  'aps',
  'as',
  'corp',
  'dk',
  'eu',
  'gmbh',
  'inc',
  'limited',
  'ltd',
  'oy',
  's',
  'sa',
  'se',
]);

const trailingNoiseTokens = new Set([
  'app',
  'bill',
  'com',
  'denmark',
  'dk',
  'eu',
  'horsens',
  'kobenhavn',
  'kobenhavn o',
  'netbutik',
  'payments',
  'sweden',
  'web',
]);

const personNameStopWords = new Set([
  'account',
  'fra',
  'from',
  'mobilepay',
  'mob',
  'pay',
  'mp',
  'overforsel',
  'overfoersel',
  'payment',
  'received',
  'sendt',
  'sent',
  'til',
  'to',
  'transfer',
]);

const incomeSalaryPaths: readonly CategoryPath[] = [{ parent: 'Income', name: 'Salary' }];
const incomeInterestPaths: readonly CategoryPath[] = [{ parent: 'Income', name: 'Interest' }];
const incomeBenefitsPaths: readonly CategoryPath[] = [{ parent: 'Income', name: 'Benefits' }];
const transferPaths: readonly CategoryPath[] = [{ parent: 'Transfers', name: 'Transfer' }];
const mobilePayPaths: readonly CategoryPath[] = [{ parent: 'Transfers', name: 'MobilePay' }];
const parkingPaths: readonly CategoryPath[] = [{ parent: 'Transport', name: 'Transport' }];
const phonePaths: readonly CategoryPath[] = [{ parent: 'Bills', name: 'Bills' }];
const insurancePaths: readonly CategoryPath[] = [{ parent: 'Bills', name: 'Bills' }];
const fuelPaths: readonly CategoryPath[] = [{ parent: 'Transport', name: 'Transport' }];
const publicTransitPaths: readonly CategoryPath[] = [{ parent: 'Transport', name: 'Transport' }];
const restaurantsPaths: readonly CategoryPath[] = [{ parent: 'Food', name: 'Restaurants' }];
const groceriesPaths: readonly CategoryPath[] = [{ parent: 'Food', name: 'Groceries' }];
const subscriptionsPaths: readonly CategoryPath[] = [{ parent: 'Entertainment', name: 'Entertainment' }];
const hobbyCreativePaths: readonly CategoryPath[] = [{ parent: 'Entertainment', name: 'Entertainment' }];
const fitnessPaths: readonly CategoryPath[] = [{ parent: 'Sport', name: 'Sport' }];
const personalCarePaths: readonly CategoryPath[] = [{ parent: 'Shopping', name: 'Shopping' }];
const travelPaths: readonly CategoryPath[] = [{ parent: 'Travel', name: 'Travel' }];
const rentPaths: readonly CategoryPath[] = [{ parent: 'Rent', name: 'Rent' }];
const internetPaths: readonly CategoryPath[] = [{ parent: 'Bills', name: 'Bills' }];
const shoppingElectronicsPaths: readonly CategoryPath[] = [{ parent: 'Shopping', name: 'Shopping' }];
const shoppingClothesPaths: readonly CategoryPath[] = [{ parent: 'Shopping', name: 'Shopping' }];
const doctorPaths: readonly CategoryPath[] = [{ parent: 'Doctor', name: 'Doctor' }];

const merchantAliases: readonly MerchantAliasDefinition[] = [
  { canonical: 'apple', patterns: [/\bapple\b/, /\bapple com bill\b/, /\bitunes\b/] },
  { canonical: 'banken food hall', patterns: [/\bbanken food hall\b/, /\blivet i byen\b/] },
  { canonical: 'bilka', patterns: [/\bbilka\b/] },
  { canonical: 'bs ab albo', patterns: [/\bbs ab albo\b/, /\baarhus bolig\b/] },
  { canonical: 'ceramics', patterns: [/\bceramic\b/, /\bceramics\b/, /\bpottery\b/, /\bclay studio\b/] },
  { canonical: 'citybee', patterns: [/\bcitybee\b/] },
  { canonical: 'claude', patterns: [/\bclaude\b/] },
  { canonical: 'circle k', patterns: [/\bcircle k\b/] },
  { canonical: 'coop 365', patterns: [/\bcoop ?365\b/, /\bcoop365discount\b/] },
  { canonical: 'dazn', patterns: [/\bdazn\b/] },
  { canonical: 'disney', patterns: [/\bdisney\b/] },
  { canonical: 'dsb', patterns: [/\bdsb\b/] },
  { canonical: 'easy park', patterns: [/\beasy ?park\b/] },
  { canonical: 'elgiganten', patterns: [/\belgiganten\b/] },
  { canonical: 'f24', patterns: [/\bf24\b/] },
  { canonical: 'fakta', patterns: [/\bfakta\b/] },
  { canonical: 'fitness world', patterns: [/\bfitness world\b/] },
  { canonical: 'fitnessx', patterns: [/\bfitnessx\b/] },
  { canonical: 'flying tiger', patterns: [/\bflying tiger\b/] },
  { canonical: 'fotex', patterns: [/\bfotex\b/, /\bfoetex\b/] },
  { canonical: 'gomore', patterns: [/\bgomore\b/] },
  { canonical: 'greenmobility', patterns: [/\bgreenmobility\b/] },
  { canonical: 'harald nyborg', patterns: [/\bharald nyborg\b/] },
  { canonical: 'hm', patterns: [/\bhennes mauritz\b/, /\bhm\b/] },
  { canonical: 'if', patterns: [/\b if\b/, /^if\b/, /\bif forsikring\b/] },
  { canonical: 'ingo', patterns: [/\bingo\b/] },
  { canonical: 'interest', patterns: [/\binterest\b/] },
  { canonical: 'jysk', patterns: [/\bjysk\b/] },
  { canonical: 'kiwi.com', patterns: [/\bkiwi\b/] },
  { canonical: 'lebara', patterns: [/\blebara\b/] },
  { canonical: 'lidl', patterns: [/\blidl\b/] },
  { canonical: 'lyca mobile', patterns: [/\blyca\b/] },
  { canonical: 'matas', patterns: [/\bmatas\b/] },
  { canonical: 'mcdonalds', patterns: [/\bmcdonalds\b/, /\bmcd\b/] },
  { canonical: 'meny', patterns: [/\bmeny\b/] },
  { canonical: 'midttrafik', patterns: [/\bmidttrafik\b/] },
  { canonical: 'mobilepay', patterns: [/\bmobilepay\b/, /\bmob pay\b/] },
  { canonical: 'mono', patterns: [/\bmono\b/, /\bmonobank\b/] },
  { canonical: 'netto', patterns: [/\bnetto\b/] },
  { canonical: 'normal', patterns: [/\bnormal\b/] },
  { canonical: 'nortec', patterns: [/\bnortec\b/] },
  { canonical: 'oister', patterns: [/\boister\b/, /\boi ster\b/] },
  { canonical: 'ok', patterns: [/\bok\b/, /\bok amba\b/] },
  { canonical: 'power', patterns: [/\bpower\b/] },
  { canonical: 'proshop', patterns: [/\bproshop\b/] },
  { canonical: 'puregym', patterns: [/\bpuregym\b/] },
  { canonical: 'q8', patterns: [/\bq8\b/] },
  { canonical: 'rejsekort', patterns: [/\brejsekort\b/] },
  { canonical: 'rema 1000', patterns: [/\brema ?1000\b/] },
  { canonical: 'revolut', patterns: [/\brevolut\b/] },
  { canonical: 'shein', patterns: [/\bshein\b/] },
  { canonical: 'spotify', patterns: [/\bspotify\b/] },
  { canonical: 'steam', patterns: [/\bsteam\b/] },
  { canonical: 'su', patterns: [/\bsu\b/] },
  { canonical: 'sunset boulevard', patterns: [/\bsunset\b/] },
  { canonical: 'temu', patterns: [/\btemu\b/] },
  { canonical: 'the burger concept', patterns: [/\bthe burger concept\b/, /\btbc\b/] },
  { canonical: 'transfergo', patterns: [/\btransfergo\b/] },
  { canonical: 'tryg', patterns: [/\btryg\b/] },
  { canonical: 'wolt', patterns: [/\bwolt\b/] },
  { canonical: 'zalando', patterns: [/\bzalando\b/] },
];

const curatedCategories: readonly CuratedCategoryDefinition[] = [
  { canonical: 'apple', expense: subscriptionsPaths, confidence: 0.99 },
  { canonical: 'banken food hall', expense: restaurantsPaths, confidence: 0.99 },
  { canonical: 'bilka', expense: groceriesPaths, confidence: 0.98 },
  { canonical: 'bs ab albo', expense: rentPaths, confidence: 0.99 },
  { canonical: 'ceramics', expense: hobbyCreativePaths, confidence: 0.9 },
  { canonical: 'claude', expense: subscriptionsPaths, confidence: 0.99 },
  { canonical: 'coop 365', expense: groceriesPaths, confidence: 0.97 },
  { canonical: 'dazn', expense: subscriptionsPaths, confidence: 0.97 },
  { canonical: 'disney', expense: subscriptionsPaths, confidence: 0.97 },
  { canonical: 'dsb', expense: publicTransitPaths, confidence: 0.97 },
  { canonical: 'easy park', expense: parkingPaths, confidence: 0.99 },
  { canonical: 'elgiganten', expense: shoppingElectronicsPaths, confidence: 0.94 },
  { canonical: 'f24', expense: fuelPaths, confidence: 0.97 },
  { canonical: 'fakta', expense: groceriesPaths, confidence: 0.96 },
  { canonical: 'fitness world', expense: fitnessPaths, confidence: 0.97 },
  { canonical: 'fitnessx', expense: fitnessPaths, confidence: 0.96 },
  { canonical: 'flying tiger', expense: personalCarePaths, confidence: 0.9 },
  { canonical: 'fotex', expense: groceriesPaths, confidence: 0.96 },
  { canonical: 'harald nyborg', expense: shoppingElectronicsPaths, confidence: 0.9 },
  { canonical: 'hm', expense: shoppingClothesPaths, confidence: 0.93 },
  { canonical: 'if', expense: insurancePaths, confidence: 0.97 },
  { canonical: 'ingo', expense: fuelPaths, confidence: 0.98 },
  { canonical: 'interest', income: incomeInterestPaths, confidence: 0.99 },
  { canonical: 'jysk', expense: shoppingElectronicsPaths, confidence: 0.9 },
  { canonical: 'kiwi.com', expense: travelPaths, confidence: 0.96 },
  { canonical: 'lebara', expense: phonePaths, confidence: 0.97 },
  { canonical: 'lidl', expense: groceriesPaths, confidence: 0.96 },
  { canonical: 'lyca mobile', expense: phonePaths, confidence: 0.95 },
  { canonical: 'matas', expense: personalCarePaths, confidence: 0.97 },
  { canonical: 'mcdonalds', expense: restaurantsPaths, confidence: 0.95 },
  { canonical: 'meny', expense: groceriesPaths, confidence: 0.92 },
  { canonical: 'midttrafik', expense: publicTransitPaths, confidence: 0.98 },
  { canonical: 'mono', expense: transferPaths, confidence: 0.99 },
  { canonical: 'netto', expense: groceriesPaths, confidence: 0.96 },
  { canonical: 'normal', expense: personalCarePaths, confidence: 0.97 },
  { canonical: 'nortec', expense: internetPaths, confidence: 0.86 },
  { canonical: 'oister', expense: phonePaths, confidence: 0.98 },
  { canonical: 'ok', expense: fuelPaths, confidence: 0.96 },
  { canonical: 'power', expense: shoppingElectronicsPaths, confidence: 0.92 },
  { canonical: 'proshop', expense: shoppingElectronicsPaths, confidence: 0.94 },
  { canonical: 'puregym', expense: fitnessPaths, confidence: 0.98 },
  { canonical: 'q8', expense: fuelPaths, confidence: 0.96 },
  { canonical: 'rejsekort', expense: publicTransitPaths, confidence: 0.98 },
  { canonical: 'rema 1000', expense: groceriesPaths, confidence: 0.96 },
  { canonical: 'revolut', expense: transferPaths, confidence: 0.99, isSharedTopup: true },
  { canonical: 'shein', expense: shoppingClothesPaths, confidence: 0.92 },
  { canonical: 'spotify', expense: subscriptionsPaths, confidence: 0.99 },
  { canonical: 'steam', expense: subscriptionsPaths, confidence: 0.95 },
  { canonical: 'su', income: incomeBenefitsPaths, confidence: 0.99 },
  { canonical: 'sunset boulevard', expense: restaurantsPaths, confidence: 0.93 },
  { canonical: 'temu', expense: shoppingClothesPaths, confidence: 0.9 },
  { canonical: 'the burger concept', expense: restaurantsPaths, confidence: 0.96 },
  { canonical: 'transfergo', expense: transferPaths, income: transferPaths, confidence: 0.98 },
  { canonical: 'tryg', expense: insurancePaths, confidence: 0.99 },
  { canonical: 'wolt', expense: restaurantsPaths, confidence: 0.95 },
  { canonical: 'zalando', expense: shoppingClothesPaths, confidence: 0.95 },
  { canonical: 'apotek', expense: doctorPaths, confidence: 0.88 },
];

const normalizeCategoryName = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, '');

const normalizeAsciiText = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[æøå]/gi, (char) => translationMap[char.toLowerCase()] ?? char)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stripPaymentRails = (value: string): string =>
  value
    .replace(/\bmobile\s*pay\b/gi, ' ')
    .replace(/\bmob\.?\s*pay\b/gi, ' ')
    .replace(/\bapple\s*pay\b/gi, ' ')
    .replace(/\bgoogle\s*pay\b/gi, ' ')
    .replace(/\bmp\b/gi, ' ');

const stripBankNoise = (value: string): string =>
  value
    .replace(/\bvisa\b/gi, ' ')
    .replace(/\bmastercard\b/gi, ' ')
    .replace(/\bdebit\b/gi, ' ')
    .replace(/\bcredit\b/gi, ' ')
    .replace(/\bcard\b/gi, ' ')
    .replace(/\bpayment fee\b/gi, ' payment fee ')
    .replace(/\bwww\./gi, ' ')
    .replace(/\bhttps?:/gi, ' ');

const splitRawSegments = (value: string): string[] =>
  value
    .split(/(?:\s[-–—]\s|[*|/]|:\s+)/g)
    .map((segment) => segment.trim())
    .filter(Boolean);

const trimTrailingNoiseTokens = (tokens: string[]): string[] => {
  const next = [...tokens];
  while (next.length > 1) {
    const tail = next[next.length - 1] ?? '';
    if (/^\d+$/.test(tail) || companySuffixTokens.has(tail) || trailingNoiseTokens.has(tail)) {
      next.pop();
      continue;
    }
    break;
  }
  return next;
};

const collapseRepeatedTokens = (tokens: string[]): string[] => {
  if (tokens.length >= 2 && tokens.length % 2 === 0) {
    const half = tokens.length / 2;
    const left = tokens.slice(0, half).join(' ');
    const right = tokens.slice(half).join(' ');
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

const normalizeMerchantSegment = (value: string): string => {
  const normalized = normalizeAsciiText(stripBankNoise(stripPaymentRails(value)));
  if (!normalized) return '';
  const collapsed = collapseRepeatedTokens(normalized.split(' '));
  const trimmed = trimTrailingNoiseTokens(collapsed).join(' ').trim();
  return trimmed;
};

const dedupeSegments = (segments: string[]): string[] => {
  const out: string[] = [];
  for (const segment of segments) {
    if (!segment || genericMerchantValues.has(segment)) continue;
    if (out.includes(segment)) continue;
    const previous = out[out.length - 1];
    if (previous && (segment.startsWith(previous) || previous.startsWith(segment))) {
      if (segment.length < previous.length) {
        out[out.length - 1] = segment;
      }
      continue;
    }
    out.push(segment);
  }
  return out;
};

const findCanonicalMerchant = (normalizedText: string): string | null => {
  for (const alias of merchantAliases) {
    if (alias.patterns.some((pattern) => pattern.test(normalizedText))) {
      return alias.canonical;
    }
  }
  return null;
};

const isSalaryLike = (normalizedText: string, sender: string): boolean =>
  /\blonoverforsel\b|\blonoverfoersel\b|\bsalary\b/.test(normalizedText) ||
  /\bbeumer group\b|\buniwelco\b/.test(sender);

const isBenefitsLike = (normalizedText: string, sender: string): boolean =>
  normalizedText === 'su' ||
  /\buddannelses og forsknings\b/.test(sender);

const isInterestLike = (normalizedText: string): boolean => normalizedText === 'interest';

export const normalizeMerchantLookupKey = (value: string): string => {
  const normalized = normalizeMerchantSegment(value);
  return findCanonicalMerchant(normalized) ?? normalized;
};

export const normalizeMerchantContext = (context: MerchantSuggestionContext): string => {
  const primaryText = [context.rawText ?? context.name, context.message ?? '', context.comment ?? '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
  const normalizedWhole = normalizeMerchantSegment(primaryText);
  const canonicalWhole = findCanonicalMerchant(normalizedWhole);
  if (canonicalWhole) return canonicalWhole;

  const segments = dedupeSegments(
    splitRawSegments(primaryText)
      .map(normalizeMerchantSegment)
      .filter(Boolean),
  );
  if (segments.length > 0) {
    for (const segment of segments) {
      const canonicalSegment = findCanonicalMerchant(segment);
      if (canonicalSegment) return canonicalSegment;
    }
    return segments[0] ?? normalizedWhole;
  }

  if (normalizedWhole) return normalizedWhole;

  const counterparty = [context.sender ?? '', context.receiver ?? '']
    .map((part) => normalizeMerchantSegment(part))
    .find(Boolean);
  return counterparty ?? '';
};

const findCategoryCandidateId = (
  candidates: readonly MerchantCategoryCandidate[],
  preferred: readonly CategoryPath[],
): string | null => {
  for (const category of preferred) {
    const match = candidates.find(
      (candidate) =>
        normalizeCategoryName(candidate.parent) === normalizeCategoryName(category.parent) &&
        normalizeCategoryName(candidate.name) === normalizeCategoryName(category.name),
    );
    if (match) return match.id;
  }
  return null;
};

const resolveCuratedDefinition = (
  canonicalMerchant: string,
  kind: TransactionKind,
): CuratedCategoryDefinition | null =>
  curatedCategories.find((definition) => {
    if (definition.canonical !== canonicalMerchant) return false;
    return kind === 'income' ? Boolean(definition.income?.length) : Boolean(definition.expense?.length);
  }) ?? null;

export const shouldAutoMarkSharedTopup = ({
  name,
  comment,
  rawText,
}: {
  name: string;
  comment?: string | null;
  rawText?: string | null;
}): boolean => {
  const normalizedMerchant = normalizeMerchantContext({
    kind: 'expense',
    name,
    comment,
    rawText,
  });
  return normalizedMerchant === 'revolut';
};

export const resolveCuratedCategoryCandidate = ({
  context,
  candidates,
}: {
  context: MerchantSuggestionContext;
  candidates: readonly MerchantCategoryCandidate[];
}): MerchantCategorySuggestion | null => {
  const normalizedMerchant = normalizeMerchantContext(context);
  const normalizedSender = normalizeAsciiText(context.sender ?? '');
  const normalizedRawText = normalizeAsciiText(context.rawText ?? context.name);

  if (!normalizedMerchant && !normalizedRawText) return null;

  if (context.kind === 'income') {
    if (isSalaryLike(normalizedRawText || normalizedMerchant, normalizedSender)) {
      const categoryId = findCategoryCandidateId(candidates, incomeSalaryPaths);
      if (categoryId) {
        return {
          categoryId,
          confidence: 0.99,
          source: 'rule',
          normalizedMerchant: normalizedMerchant || 'lonoverforsel',
          canonicalMerchant: 'salary',
          isSharedTopup: false,
        };
      }
    }

    if (isBenefitsLike(normalizedMerchant || normalizedRawText, normalizedSender)) {
      const categoryId = findCategoryCandidateId(candidates, incomeBenefitsPaths);
      if (categoryId) {
        return {
          categoryId,
          confidence: 0.99,
          source: 'rule',
          normalizedMerchant: normalizedMerchant || 'su',
          canonicalMerchant: 'su',
          isSharedTopup: false,
        };
      }
    }

    if (isInterestLike(normalizedMerchant || normalizedRawText)) {
      const categoryId = findCategoryCandidateId(candidates, incomeInterestPaths);
      if (categoryId) {
        return {
          categoryId,
          confidence: 0.99,
          source: 'rule',
          normalizedMerchant: normalizedMerchant || 'interest',
          canonicalMerchant: 'interest',
          isSharedTopup: false,
        };
      }
    }
  }

  const curated = resolveCuratedDefinition(normalizedMerchant, context.kind);
  if (!curated) return null;

  const categoryId = findCategoryCandidateId(
    candidates,
    context.kind === 'income' ? (curated.income ?? []) : (curated.expense ?? []),
  );
  if (!categoryId) return null;

  return {
    categoryId,
    confidence: curated.confidence,
    source: 'rule',
    normalizedMerchant,
    canonicalMerchant: curated.canonical,
    isSharedTopup: Boolean(curated.isSharedTopup),
  };
};

const alphaOnlyToken = /^[a-z][a-z'-]*$/;

const isPlausibleTransferPersonName = (value: string): boolean => {
  const parts = value
    .split(' ')
    .filter((part) => part.length > 1 && !personNameStopWords.has(part));

  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every((part) => alphaOnlyToken.test(part));
};

export const extractProbableTransferPersonName = (context: MerchantSuggestionContext): string | null => {
  const mobilePaySource = [context.rawText ?? context.name, context.message ?? '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
  const normalizedSource = normalizeAsciiText(mobilePaySource);
  if (!/\bmobilepay\b|\bmob pay\b/.test(normalizedSource)) return null;

  const stripped = normalizeTransferPersonName(
    stripPaymentRails(stripBankNoise(mobilePaySource))
      .replace(/\boverforsel\b/gi, ' ')
      .replace(/\boverfoersel\b/gi, ' ')
      .replace(/\btransfer\b/gi, ' '),
  );
  if (!stripped) return null;

  return isPlausibleTransferPersonName(stripped) ? stripped : null;
};

export const matchTransferPersonName = ({
  context,
  normalizedPeople,
}: {
  context: MerchantSuggestionContext;
  normalizedPeople: readonly string[];
}): string | null => {
  const exactName = normalizeTransferPersonName(context.name);
  if (exactName && normalizedPeople.includes(exactName) && isPlausibleTransferPersonName(exactName)) {
    return exactName;
  }

  const extractedName = extractProbableTransferPersonName(context);
  if (!extractedName || !normalizedPeople.includes(extractedName)) return null;
  return extractedName;
};

export const resolveTransferPersonCandidate = ({
  context,
  candidates,
  normalizedPeople,
}: {
  context: MerchantSuggestionContext;
  candidates: readonly MerchantCategoryCandidate[];
  normalizedPeople: readonly string[];
}): MerchantCategorySuggestion | null => {
  const personName = matchTransferPersonName({ context, normalizedPeople });
  if (!personName) return null;

  const categoryId = findCategoryCandidateId(candidates, mobilePayPaths);
  if (!categoryId) return null;

  return {
    categoryId,
    confidence: 0.99,
    source: 'transfer_person',
    normalizedMerchant: personName,
    canonicalMerchant: personName,
    isSharedTopup: false,
  };
};

export const pickDeterministicRankedCandidate = (
  candidates: readonly RankedMerchantCategoryCandidate[],
): MerchantCategorySuggestion | null => {
  const best = candidates[0];
  if (!best) return null;

  if (best.source === 'rule') {
    return {
      categoryId: best.categoryId,
      confidence: best.confidence,
      source: 'rule',
      normalizedMerchant: best.normalizedMerchant,
      canonicalMerchant: best.canonicalMerchant,
      isSharedTopup: best.isSharedTopup,
    };
  }

  if (
    best.source === 'memory_exact' &&
    (best.observationCount ?? 0) >= 2 &&
    (best.supportRatio ?? 0) >= 0.85
  ) {
    return {
      categoryId: best.categoryId,
      confidence: best.confidence,
      source: 'memory_exact',
      normalizedMerchant: best.normalizedMerchant,
      canonicalMerchant: best.canonicalMerchant,
      isSharedTopup: best.isSharedTopup,
    };
  }

  if (
    best.source === 'memory_fuzzy' &&
    (best.similarity ?? 0) >= 0.82 &&
    (best.observationCount ?? 0) >= 3 &&
    (best.supportRatio ?? 0) >= 0.9
  ) {
    return {
      categoryId: best.categoryId,
      confidence: best.confidence,
      source: 'memory_fuzzy',
      normalizedMerchant: best.normalizedMerchant,
      canonicalMerchant: best.canonicalMerchant,
      isSharedTopup: best.isSharedTopup,
    };
  }

  return null;
};

export const formatMerchantCategorySource = (source: MerchantCategorySource): string => {
  switch (source) {
    case 'rule':
      return 'Rule';
    case 'memory_exact':
      return 'Memory';
    case 'memory_fuzzy':
      return 'Fuzzy memory';
    case 'transfer_person':
      return 'Transfer person';
    case 'ai':
      return 'AI review';
    default:
      return 'Suggestion';
  }
};

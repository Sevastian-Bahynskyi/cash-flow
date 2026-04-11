import type { TransactionKind } from './types';

export type CategorizationCandidate = {
  id: string;
  parent: string;
  name: string;
  icon?: string;
};

const translationMap: Record<string, string> = {
  æ: 'ae',
  ø: 'o',
  å: 'a',
};

const normalizeRuleText = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[æøå]/gi, (char) => translationMap[char.toLowerCase()] ?? char)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stripPaymentWrappers = (value: string): string =>
  value
    .replace(/\bmobilepay\b/gi, ' ')
    .replace(/\bmob\s*pay\b/gi, ' ')
    .replace(/\bapple\s*pay\b/gi, ' ')
    .replace(/\bgoogle\s*pay\b/gi, ' ')
    .replace(/\bmp\b/gi, ' ');

const normalizeLookupText = (value: string): string =>
  normalizeRuleText(stripPaymentWrappers(value)).replace(/[0-9]+/g, '#').trim();

const combineLookupText = (name: string, comment?: string | null): string =>
  [name, comment ?? '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');

const includesAny = (value: string, needles: readonly string[]): boolean =>
  needles.some((needle) => value.includes(normalizeRuleText(needle)));

const includesWholeWord = (value: string, word: string): boolean => {
  const padded = ` ${value} `;
  const normalizedWord = normalizeRuleText(word);
  return padded.includes(` ${normalizedWord} `);
};

const normalizeCategoryName = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, '');

const findCategoryCandidateId = (
  candidates: readonly CategorizationCandidate[],
  parentName: string,
  categoryName: string,
): string | null =>
  candidates.find(
    (candidate) =>
      normalizeCategoryName(candidate.parent) === normalizeCategoryName(parentName) &&
      normalizeCategoryName(candidate.name) === normalizeCategoryName(categoryName),
  )?.id ?? null;

const findTransferCategoryCandidateId = (
  candidates: readonly CategorizationCandidate[],
): string | null =>
  findCategoryCandidateId(candidates, 'Transfers', 'Transfer') ??
  candidates.find(
    (candidate) =>
      normalizeCategoryName(candidate.parent) === 'transfers' &&
      normalizeCategoryName(candidate.name) !== 'mobilepay',
  )?.id ??
  candidates.find((candidate) => normalizeCategoryName(candidate.parent) === 'transfers')?.id ??
  null;

const salaryMarkers = ['lønoverførsel', 'lonoverforsel', 'lonoverfoersel', 'salary'];
const parkingMarkers = ['easy park', 'easypark'];
const phoneMarkers = ['oister', 'oi ster'];
const appleBillMarkers = ['apple com bill', 'apple bill', 'itunes com bill'];
const foodHallMarkers = ['banken food hall', 'livet i byen'];

export const normalizeMerchantLookupKey = (value: string): string => normalizeLookupText(value);

export const resolveHardcodedCategoryCandidate = ({
  kind,
  name,
  comment,
  candidates,
}: {
  kind: TransactionKind;
  name: string;
  comment?: string | null;
  candidates: readonly CategorizationCandidate[];
}): { categoryId: string; confidence: number; rule: string } | null => {
  const lookup = normalizeRuleText(combineLookupText(name, comment));
  if (lookup.length < 2) return null;

  if (kind === 'income' && includesAny(lookup, salaryMarkers)) {
    const categoryId = findCategoryCandidateId(candidates, 'Income', 'Salary');
    if (categoryId) return { categoryId, confidence: 0.99, rule: 'salary-income' };
  }

  if (kind !== 'expense') return null;

  if (includesAny(lookup, parkingMarkers)) {
    const categoryId = findCategoryCandidateId(candidates, 'Transport', 'Parking');
    if (categoryId) return { categoryId, confidence: 0.99, rule: 'parking-merchant' };
  }

  if (includesAny(lookup, phoneMarkers)) {
    const categoryId = findCategoryCandidateId(candidates, 'Household', 'Phone');
    if (categoryId) return { categoryId, confidence: 0.98, rule: 'phone-provider' };
  }

  if (includesAny(lookup, foodHallMarkers)) {
    const categoryId = findCategoryCandidateId(candidates, 'Food', 'Restaurants');
    if (categoryId) return { categoryId, confidence: 0.96, rule: 'restaurant-merchant' };
  }

  if (includesAny(lookup, appleBillMarkers)) {
    const categoryId = findCategoryCandidateId(candidates, 'Household', 'Internet');
    if (categoryId) return { categoryId, confidence: 0.9, rule: 'apple-bill' };
  }

  if (
    lookup.startsWith('mono ') ||
    includesWholeWord(lookup, 'monobank') ||
    includesWholeWord(lookup, 'revolut')
  ) {
    const categoryId = findTransferCategoryCandidateId(candidates);
    if (categoryId) return { categoryId, confidence: 0.98, rule: 'bank-transfer' };
  }

  return null;
};

export const shouldAutoMarkSharedTopup = ({
  name,
  comment,
}: {
  name: string;
  comment?: string | null;
}): boolean => {
  const lookup = normalizeRuleText(combineLookupText(name, comment));
  return includesWholeWord(lookup, 'revolut');
};

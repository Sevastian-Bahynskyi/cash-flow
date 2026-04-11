export type TransactionKind = "expense" | "income";

export type Candidate = {
  id: string;
  parent: string;
  name: string;
};

const translationMap: Record<string, string> = {
  æ: "ae",
  ø: "o",
  å: "a",
};

const normalizeRuleText = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[æøå]/gi, (char) => translationMap[char.toLowerCase()] ?? char)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeCategoryName = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, "");

const combineLookupText = (name: string, comment?: string | null): string =>
  [name, comment ?? ""]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");

const includesAny = (value: string, markers: readonly string[]): boolean =>
  markers.some((marker) => value.includes(normalizeRuleText(marker)));

const includesWholeWord = (value: string, word: string): boolean => {
  const padded = ` ${value} `;
  const normalizedWord = normalizeRuleText(word);
  return padded.includes(` ${normalizedWord} `);
};

const findCategoryId = (
  candidates: readonly Candidate[],
  parentName: string,
  categoryName: string,
): string | null =>
  candidates.find(
    (candidate) =>
      normalizeCategoryName(candidate.parent) === normalizeCategoryName(parentName) &&
      normalizeCategoryName(candidate.name) === normalizeCategoryName(categoryName),
  )?.id ?? null;

export const findTransferCategoryId = (candidates: readonly Candidate[]): string | null =>
  findCategoryId(candidates, "Transfers", "Transfer") ??
  candidates.find(
    (candidate) =>
      normalizeCategoryName(candidate.parent) === "transfers" &&
      normalizeCategoryName(candidate.name) !== "mobilepay",
  )?.id ??
  candidates.find((candidate) => normalizeCategoryName(candidate.parent) === "transfers")?.id ??
  null;

export const findMobilePayCategoryId = (candidates: readonly Candidate[]): string | null =>
  findCategoryId(candidates, "Transfers", "MobilePay");

export const isMobilePayCategoryId = (
  categoryId: string | null | undefined,
  candidates: readonly Candidate[],
): boolean => {
  if (!categoryId) return false;
  const candidate = candidates.find((item) => item.id === categoryId);
  return Boolean(
    candidate &&
      normalizeCategoryName(candidate.parent) === "transfers" &&
      normalizeCategoryName(candidate.name) === "mobilepay",
  );
};

const salaryMarkers = ["lønoverførsel", "lonoverforsel", "lonoverfoersel", "salary"];
const parkingMarkers = ["easy park", "easypark"];
const phoneMarkers = ["oister", "oi ster"];
const appleBillMarkers = ["apple com bill", "apple bill", "itunes com bill"];
const foodHallMarkers = ["banken food hall", "livet i byen"];

export const resolveHardcodedCategoryId = ({
  kind,
  name,
  comment,
  candidates,
}: {
  kind: TransactionKind;
  name: string;
  comment?: string | null;
  candidates: readonly Candidate[];
}): { categoryId: string; confidence: number; rule: string } | null => {
  const lookup = normalizeRuleText(combineLookupText(name, comment));
  if (lookup.length < 2) return null;

  if (kind === "income" && includesAny(lookup, salaryMarkers)) {
    const categoryId = findCategoryId(candidates, "Income", "Salary");
    if (categoryId) return { categoryId, confidence: 0.99, rule: "salary-income" };
  }

  if (kind !== "expense") return null;

  if (includesAny(lookup, parkingMarkers)) {
    const categoryId = findCategoryId(candidates, "Transport", "Parking");
    if (categoryId) return { categoryId, confidence: 0.99, rule: "parking-merchant" };
  }

  if (includesAny(lookup, phoneMarkers)) {
    const categoryId = findCategoryId(candidates, "Household", "Phone");
    if (categoryId) return { categoryId, confidence: 0.98, rule: "phone-provider" };
  }

  if (includesAny(lookup, foodHallMarkers)) {
    const categoryId = findCategoryId(candidates, "Food", "Restaurants");
    if (categoryId) return { categoryId, confidence: 0.96, rule: "restaurant-merchant" };
  }

  if (includesAny(lookup, appleBillMarkers)) {
    const categoryId = findCategoryId(candidates, "Household", "Internet");
    if (categoryId) return { categoryId, confidence: 0.9, rule: "apple-bill" };
  }

  if (
    lookup.startsWith("mono ") ||
    includesWholeWord(lookup, "monobank") ||
    includesWholeWord(lookup, "revolut")
  ) {
    const categoryId = findTransferCategoryId(candidates);
    if (categoryId) return { categoryId, confidence: 0.98, rule: "bank-transfer" };
  }

  return null;
};

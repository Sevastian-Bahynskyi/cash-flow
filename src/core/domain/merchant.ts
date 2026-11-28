type MerchantAliasDefinition = {
  canonical: string;
  patterns: readonly RegExp[];
};

const translationMap: Record<string, string> = {
  æ: 'ae',
  ø: 'o',
  å: 'a',
};

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

const findCanonicalMerchant = (normalizedText: string): string | null => {
  for (const alias of merchantAliases) {
    if (alias.patterns.some((pattern) => pattern.test(normalizedText))) {
      return alias.canonical;
    }
  }
  return null;
};

export const normalizeMerchantLookupKey = (value: string): string => {
  const normalized = normalizeMerchantSegment(value);
  return findCanonicalMerchant(normalized) ?? normalized;
};

#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);

const getArgValue = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
};

const inputPath = getArgValue('--input', '/Users/seva/Downloads/export.csv');
const outputPath = getArgValue('--output');
const sqlDirPath = getArgValue('--sql-dir');
const userId = getArgValue('--user-id', '9d3ee47b-93a9-465b-8274-3663f2d12cb5');

const translationMap = {
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
  'horsens',
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

const explicitRuleMerchants = new Set([
  'apple',
  'banken food hall',
  'bilka',
  'claude',
  'dsb',
  'easy park',
  'f24',
  'fitness world',
  'if',
  'ingo',
  'interest',
  'lebara',
  'lidl',
  'matas',
  'midttrafik',
  'mono',
  'netto',
  'normal',
  'oister',
  'puregym',
  'q8',
  'rejsekort',
  'rema 1000',
  'revolut',
  'spotify',
  'su',
  'transfergo',
  'tryg',
  'lonoverforsel',
]);

const MIN_MEMORY_OBSERVATIONS = 2;
const MIN_RULE_OBSERVATIONS = 3;
const MIN_RULE_SUPPORT_RATIO = 0.9;
const MIN_TRANSFER_PERSON_OCCURRENCES = 4;

const merchantAliases = [
  { canonical: 'apple', patterns: [/\bapple\b/, /\bapple com bill\b/, /\bitunes\b/] },
  { canonical: 'banken food hall', patterns: [/\bbanken food hall\b/, /\blivet i byen\b/] },
  { canonical: 'bilka', patterns: [/\bbilka\b/] },
  { canonical: 'bs ab albo', patterns: [/\bbs ab albo\b/, /\baarhus bolig\b/] },
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
  { canonical: 'if', patterns: [/^if\b/, /\bif forsikring\b/] },
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

const categoryPaths = {
  benefits: { parentName: 'Income', categoryName: 'Benefits' },
  clothes: { parentName: 'Shopping', categoryName: 'Clothes' },
  electronics: { parentName: 'Shopping', categoryName: 'Electronics' },
  fitness: { parentName: 'Health', categoryName: 'Fitness' },
  fuel: { parentName: 'Transport', categoryName: 'Fuel' },
  groceries: { parentName: 'Food', categoryName: 'Groceries' },
  insurance: { parentName: 'Household', categoryName: 'Insurance' },
  interest: { parentName: 'Income', categoryName: 'Interest' },
  internet: { parentName: 'Household', categoryName: 'Internet' },
  mobilepay: { parentName: 'Transfers', categoryName: 'MobilePay' },
  parking: { parentName: 'Transport', categoryName: 'Parking' },
  personalCare: { parentName: 'Shopping', categoryName: 'Personal care' },
  phone: { parentName: 'Household', categoryName: 'Phone' },
  pharmacy: { parentName: 'Health', categoryName: 'Pharmacy' },
  publicTransit: { parentName: 'Transport', categoryName: 'Public transit' },
  rent: { parentName: 'Household', categoryName: 'Rent' },
  restaurants: { parentName: 'Food', categoryName: 'Restaurants' },
  salary: { parentName: 'Income', categoryName: 'Salary' },
  subscriptions: { parentName: 'Entertainment', categoryName: 'Subscriptions' },
  transfer: { parentName: 'Transfers', categoryName: 'Transfer' },
  travel: { parentName: 'Entertainment', categoryName: 'Travel' },
};

const curatedCategories = {
  apple: { expense: categoryPaths.subscriptions },
  'banken food hall': { expense: categoryPaths.restaurants },
  bilka: { expense: categoryPaths.groceries },
  'bs ab albo': { expense: categoryPaths.rent },
  claude: { expense: categoryPaths.subscriptions },
  'coop 365': { expense: categoryPaths.groceries },
  dazn: { expense: categoryPaths.subscriptions },
  disney: { expense: categoryPaths.subscriptions },
  dsb: { expense: categoryPaths.publicTransit },
  'easy park': { expense: categoryPaths.parking },
  elgiganten: { expense: categoryPaths.electronics },
  f24: { expense: categoryPaths.fuel },
  fakta: { expense: categoryPaths.groceries },
  'fitness world': { expense: categoryPaths.fitness },
  fitnessx: { expense: categoryPaths.fitness },
  'flying tiger': { expense: categoryPaths.personalCare },
  fotex: { expense: categoryPaths.groceries },
  'harald nyborg': { expense: categoryPaths.electronics },
  hm: { expense: categoryPaths.clothes },
  if: { expense: categoryPaths.insurance },
  ingo: { expense: categoryPaths.fuel },
  interest: { income: categoryPaths.interest },
  jysk: { expense: categoryPaths.electronics },
  'kiwi.com': { expense: categoryPaths.travel },
  lebara: { expense: categoryPaths.phone },
  lidl: { expense: categoryPaths.groceries },
  'lyca mobile': { expense: categoryPaths.phone },
  matas: { expense: categoryPaths.personalCare },
  mcdonalds: { expense: categoryPaths.restaurants },
  meny: { expense: categoryPaths.groceries },
  midttrafik: { expense: categoryPaths.publicTransit },
  mono: { expense: categoryPaths.transfer },
  netto: { expense: categoryPaths.groceries },
  normal: { expense: categoryPaths.personalCare },
  nortec: { expense: categoryPaths.internet },
  oister: { expense: categoryPaths.phone },
  ok: { expense: categoryPaths.fuel },
  power: { expense: categoryPaths.electronics },
  proshop: { expense: categoryPaths.electronics },
  puregym: { expense: categoryPaths.fitness },
  q8: { expense: categoryPaths.fuel },
  rejsekort: { expense: categoryPaths.publicTransit },
  'rema 1000': { expense: categoryPaths.groceries },
  revolut: { expense: categoryPaths.transfer, isSharedTopup: true },
  shein: { expense: categoryPaths.clothes },
  spotify: { expense: categoryPaths.subscriptions },
  steam: { expense: { parentName: 'Entertainment', categoryName: 'Games' } },
  su: { income: categoryPaths.benefits },
  'sunset boulevard': { expense: categoryPaths.restaurants },
  temu: { expense: categoryPaths.clothes },
  'the burger concept': { expense: categoryPaths.restaurants },
  transfergo: { expense: categoryPaths.transfer, income: categoryPaths.transfer },
  tryg: { expense: categoryPaths.insurance },
  wolt: { expense: categoryPaths.restaurants },
  zalando: { expense: categoryPaths.clothes },
};

const parseCsvRows = (text, delimiter) => {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';

    if (char === '"') {
      const next = text[index + 1] ?? '';
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row);
  }

  return rows
    .map((cells) => cells.map((value) => value.replace(/^\uFEFF/, '').trim()))
    .filter((cells) => cells.some((value) => value.length > 0));
};

const parseCsv = (text) => {
  const rows = parseCsvRows(text, ',');
  const headers = rows[0] ?? [];
  return rows.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])),
  );
};

const normalizeAsciiText = (value) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[æøå]/gi, (char) => translationMap[char.toLowerCase()] ?? char)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stripPaymentRails = (value) =>
  value
    .replace(/\bmobile\s*pay\b/gi, ' ')
    .replace(/\bmob\.?\s*pay\b/gi, ' ')
    .replace(/\bmp\b/gi, ' ');

const stripBankNoise = (value) =>
  value
    .replace(/\bvisa\b/gi, ' ')
    .replace(/\bmastercard\b/gi, ' ')
    .replace(/\bdebit\b/gi, ' ')
    .replace(/\bcredit\b/gi, ' ')
    .replace(/\bcard\b/gi, ' ')
    .replace(/\bwww\./gi, ' ')
    .replace(/\bhttps?:/gi, ' ');

const collapseRepeatedTokens = (tokens) => {
  if (tokens.length >= 2 && tokens.length % 2 === 0) {
    const half = tokens.length / 2;
    if (tokens.slice(0, half).join(' ') === tokens.slice(half).join(' ')) {
      return tokens.slice(0, half);
    }
  }

  const out = [];
  for (const token of tokens) {
    if (out[out.length - 1] === token) continue;
    out.push(token);
  }
  return out;
};

const trimTrailingNoiseTokens = (tokens) => {
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

const normalizeMerchantSegment = (value) => {
  const normalized = normalizeAsciiText(stripBankNoise(stripPaymentRails(value)));
  if (!normalized) return '';
  const collapsed = collapseRepeatedTokens(normalized.split(' '));
  return trimTrailingNoiseTokens(collapsed).join(' ').trim();
};

const splitRawSegments = (value) =>
  value
    .split(/(?:\s[-–—]\s|[*|/]|:\s+)/g)
    .map((segment) => segment.trim())
    .filter(Boolean);

const findCanonicalMerchant = (normalizedText) => {
  for (const alias of merchantAliases) {
    if (alias.patterns.some((pattern) => pattern.test(normalizedText))) {
      return alias.canonical;
    }
  }
  return null;
};

const normalizeMerchant = ({ text, message = '', note = '' }) => {
  const joined = [text, message, note].filter(Boolean).join(' ');
  const normalizedWhole = normalizeMerchantSegment(joined);
  const canonicalWhole = findCanonicalMerchant(normalizedWhole);
  if (canonicalWhole) return canonicalWhole;

  const segments = [];
  for (const segment of splitRawSegments(joined)) {
    const normalized = normalizeMerchantSegment(segment);
    if (!normalized || segments.includes(normalized)) continue;
    const previous = segments[segments.length - 1];
    if (previous && (normalized.startsWith(previous) || previous.startsWith(normalized))) {
      if (normalized.length < previous.length) segments[segments.length - 1] = normalized;
      continue;
    }
    segments.push(normalized);
  }

  if (segments.length > 0) {
    for (const segment of segments) {
      const canonical = findCanonicalMerchant(segment);
      if (canonical) return canonical;
    }
    return segments[0];
  }

  return normalizedWhole;
};

const normalizeTransferPersonName = (value) =>
  value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z\u00c0-\u024f]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const collapseRepeatedNameParts = (parts) => {
  if (parts.length >= 2 && parts.length % 2 === 0) {
    const half = parts.length / 2;
    if (parts.slice(0, half).join(' ') === parts.slice(half).join(' ')) {
      return parts.slice(0, half);
    }
  }
  return parts;
};

const extractTransferPerson = (text, message) => {
  const mobilePaySource = [text, message].filter(Boolean).join(' ');
  const normalizedSource = normalizeAsciiText(mobilePaySource);
  if (!/\bmobilepay\b|\bmob pay\b/.test(normalizedSource)) return null;

  const stripped = normalizeTransferPersonName(
    stripPaymentRails(stripBankNoise(mobilePaySource))
      .replace(/\boverforsel\b/gi, ' ')
      .replace(/\boverfoersel\b/gi, ' ')
      .replace(/\btransfer\b/gi, ' '),
  );
  if (!stripped) return null;

  const parts = collapseRepeatedNameParts(
    stripped
    .split(' ')
    .filter((part) => part.length > 1 && !personNameStopWords.has(part)),
  );
  if (parts.length < 2 || parts.length > 4) return null;
  if (!parts.every((part) => /^[a-z][a-z'-]*$/i.test(part))) return null;
  return parts.join(' ');
};

const parseSignedAmount = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const sanitized = trimmed
    .replace(/[\u00a0\u202f\s]/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/[^0-9,.'-]/g, '');
  if (!sanitized) return null;
  const negative = sanitized.startsWith('-');
  const unsigned = sanitized.replace(/-/g, '');
  const lastDot = unsigned.lastIndexOf('.');
  const lastComma = unsigned.lastIndexOf(',');
  const lastSeparatorIndex = Math.max(lastDot, lastComma);
  let normalized = unsigned;
  if (lastSeparatorIndex >= 0) {
    const integerPart = unsigned.slice(0, lastSeparatorIndex);
    const fractionalPart = unsigned.slice(lastSeparatorIndex + 1);
    if (fractionalPart.length > 0 && fractionalPart.length <= 2) {
      normalized = `${integerPart.replace(/[.,']/g, '')}.${fractionalPart.replace(/[.,']/g, '')}`;
    } else {
      normalized = unsigned.replace(/[.,']/g, '');
    }
  } else {
    normalized = unsigned.replace(/'/g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const numeric = Number(`${negative ? '-' : ''}${normalized}`);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeDate = (value) => {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

const isSalaryLike = (merchant, sender) =>
  /\blonoverforsel\b|\blonoverfoersel\b|\bsalary\b/.test(merchant) ||
  /\bbeumer group\b|\buniwelco\b/.test(sender);

const isBenefitsLike = (merchant, sender) =>
  merchant === 'su' || /\buddannelses og forsknings\b/.test(sender);

const resolveCuratedCategory = (kind, merchant) => {
  const match = curatedCategories[merchant];
  if (!match) return null;
  return kind === 'income' ? match.income ?? null : match.expense ?? null;
};

const resolveCategoryPath = ({ kind, merchant, bankCategory, sender, receiver }) => {
  const normalizedBankCategory = String(bankCategory ?? '').trim();
  const normalizedSender = normalizeAsciiText(sender ?? '');
  const normalizedReceiver = normalizeAsciiText(receiver ?? '');

  if (kind === 'income') {
    if (isSalaryLike(merchant, normalizedSender)) return categoryPaths.salary;
    if (isBenefitsLike(merchant, normalizedSender)) return categoryPaths.benefits;
    if (merchant === 'interest') return categoryPaths.interest;
  }

  const curated = resolveCuratedCategory(kind, merchant);
  if (curated) return curated;

  if (normalizedBankCategory === 'Groceries') return categoryPaths.groceries;
  if (normalizedBankCategory === 'Food and Drinks') return categoryPaths.restaurants;
  if (normalizedBankCategory === 'Insurance') return categoryPaths.insurance;
  if (normalizedBankCategory === 'Vacation') return categoryPaths.travel;

  if (normalizedBankCategory === 'Transport') {
    if (['citybee', 'gomore', 'greenmobility'].includes(merchant)) return categoryPaths.travel;
    if (['easy park'].includes(merchant)) return categoryPaths.parking;
    if (['ingo', 'ok', 'q8', 'f24', 'circle k'].includes(merchant)) return categoryPaths.fuel;
    if (['dsb', 'midttrafik', 'rejsekort'].includes(merchant)) return categoryPaths.publicTransit;
  }

  if (normalizedBankCategory === 'Entertainment') {
    if (['apple', 'spotify', 'claude', 'disney', 'dazn'].includes(merchant)) return categoryPaths.subscriptions;
    if (merchant === 'steam') return { parentName: 'Entertainment', categoryName: 'Games' };
    if (['fitnessx', 'puregym', 'fitness world'].includes(merchant)) return categoryPaths.fitness;
  }

  if (normalizedBankCategory === 'Home') {
    if (merchant === 'bs ab albo') return categoryPaths.rent;
    if (['oister', 'lebara', 'lyca mobile'].includes(merchant)) return categoryPaths.phone;
    if (merchant === 'nortec') return categoryPaths.internet;
  }

  if (normalizedBankCategory === 'Personal care') {
    if (['puregym', 'fitness world', 'fitnessx'].includes(merchant)) return categoryPaths.fitness;
    if (merchant === 'apotek') return categoryPaths.pharmacy;
    return categoryPaths.personalCare;
  }

  if (normalizedBankCategory === 'Shopping') {
    if (['matas', 'normal', 'flying tiger'].includes(merchant)) return categoryPaths.personalCare;
    if (['proshop', 'power', 'elgiganten', 'harald nyborg', 'jysk'].includes(merchant)) {
      return categoryPaths.electronics;
    }
    if (['zalando', 'shein', 'temu', 'hm'].includes(merchant)) return categoryPaths.clothes;
  }

  if (merchant === 'transfergo' || merchant === 'revolut' || merchant === 'mono') {
    return categoryPaths.transfer;
  }

  if (merchant === 'mobilepay' && normalizedReceiver) {
    return categoryPaths.mobilepay;
  }

  return null;
};

const prettifyMerchant = (value) =>
  value
    .split(' ')
    .map((part) => (part.length <= 2 ? part.toUpperCase() : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(' ');

const rows = parseCsv(fs.readFileSync(path.resolve(inputPath), 'utf8'));

const merchantStats = new Map();
const ambiguous = [];
const skipped = [];
const transferPeople = new Map();

for (const row of rows) {
  const text = String(row.Text ?? '').trim();
  const message = String(row.Message ?? '').trim();
  const note = String(row.Note ?? '').trim();
  const category = String(row.Category ?? '').trim();
  const sender = String(row.Sender ?? '').trim();
  const receiver = String(row.Receiver ?? '').trim();
  const occurredOn = normalizeDate(row.Date);
  const amount = parseSignedAmount(row.Amount);
  if (!text || amount === null || !occurredOn) continue;

  const kind = amount < 0 ? 'expense' : 'income';
  const normalizedMerchant = normalizeMerchant({ text, message, note });
  if (!normalizedMerchant) {
    skipped.push({ merchant: text, reason: 'empty-normalized-merchant' });
    continue;
  }

  const transferPerson = extractTransferPerson(text, message);
  if (
    transferPerson &&
    normalizedMerchant !== 'oister' &&
    normalizedMerchant !== 'dsb' &&
    !curatedCategories[normalizedMerchant]
  ) {
    const existing = transferPeople.get(transferPerson) ?? {
      name: prettifyMerchant(transferPerson),
      normalizedName: transferPerson,
      occurrenceCount: 0,
    };
    existing.occurrenceCount += 1;
    transferPeople.set(transferPerson, existing);
  }

  const categoryPath =
    category === 'Not categorised'
      ? resolveCategoryPath({ kind, merchant: normalizedMerchant, bankCategory: category, sender, receiver })
      : resolveCategoryPath({ kind, merchant: normalizedMerchant, bankCategory: category, sender, receiver });

  const key = `${kind}:${normalizedMerchant}`;
  const existing = merchantStats.get(key) ?? {
    kind,
    normalizedMerchant,
    canonicalMerchant: normalizedMerchant,
    rows: 0,
    categorizedRows: 0,
    sampleNames: new Set(),
    lastSeenOn: occurredOn,
    isSharedTopup: normalizedMerchant === 'revolut',
    categoryCounts: new Map(),
  };

  existing.rows += 1;
  existing.sampleNames.add(text);
  if (occurredOn > existing.lastSeenOn) existing.lastSeenOn = occurredOn;
  if (categoryPath) {
    existing.categorizedRows += 1;
    const categoryKey = `${categoryPath.parentName}::${categoryPath.categoryName}`;
    existing.categoryCounts.set(categoryKey, (existing.categoryCounts.get(categoryKey) ?? 0) + 1);
  }
  merchantStats.set(key, existing);
}

const rules = [];
const memory = [];

for (const stat of merchantStats.values()) {
  const categoryEntries = [...stat.categoryCounts.entries()].sort((left, right) => right[1] - left[1]);
  const top = categoryEntries[0] ?? null;

  if (!top) {
    if (stat.rows >= 2) {
      skipped.push({
        merchant: stat.normalizedMerchant,
        rows: stat.rows,
        reason: 'no-confident-category',
      });
    }
    continue;
  }

  const [categoryKey, topCount] = top;
  const supportRatio = topCount / stat.rows;
  const [parentName, categoryName] = categoryKey.split('::');
  const note = `rows=${stat.rows}; support=${supportRatio.toFixed(2)}`;

  if (stat.rows >= MIN_MEMORY_OBSERVATIONS) {
    memory.push({
      kind: stat.kind,
      normalizedMerchant: stat.normalizedMerchant,
      canonicalMerchant: prettifyMerchant(stat.canonicalMerchant),
      parentName,
      categoryName,
      isSharedTopup: stat.isSharedTopup,
      observationCount: stat.rows,
      supportRatio: Number(supportRatio.toFixed(4)),
      sampleNames: [...stat.sampleNames].slice(0, 4),
      lastSeenOn: stat.lastSeenOn,
      source: 'bootstrap',
    });
  }

  const shouldSeedRule =
    (stat.rows >= MIN_RULE_OBSERVATIONS && supportRatio >= MIN_RULE_SUPPORT_RATIO) ||
    (
      explicitRuleMerchants.has(stat.normalizedMerchant) &&
      (
        Boolean(resolveCuratedCategory(stat.kind, stat.normalizedMerchant)) ||
        (stat.kind === 'income' &&
          ['interest', 'lonoverforsel', 'su', 'transfergo'].includes(stat.normalizedMerchant))
      )
    );

  if (shouldSeedRule) {
    rules.push({
      kind: stat.kind,
      matchTarget: 'normalized_merchant',
      matchType: 'exact',
      pattern: stat.normalizedMerchant,
      canonicalMerchant: prettifyMerchant(stat.canonicalMerchant),
      parentName,
      categoryName,
      isSharedTopup: stat.isSharedTopup,
      priority: explicitRuleMerchants.has(stat.normalizedMerchant) ? 250 : 180,
      source: explicitRuleMerchants.has(stat.normalizedMerchant) ? 'bootstrap_curated' : 'bootstrap_history',
      notes: note,
    });
  } else if (stat.rows >= 2) {
    ambiguous.push({
      merchant: stat.normalizedMerchant,
      rows: stat.rows,
      parentName,
      categoryName,
      supportRatio: Number(supportRatio.toFixed(4)),
    });
  }
}

const transferPeoplePayload = [...transferPeople.values()]
  .filter((row) => row.occurrenceCount >= MIN_TRANSFER_PERSON_OCCURRENCES)
  .sort((left, right) => right.occurrenceCount - left.occurrenceCount);

rules.sort((left, right) => right.priority - left.priority || left.pattern.localeCompare(right.pattern));
memory.sort((left, right) => right.observationCount - left.observationCount || left.normalizedMerchant.localeCompare(right.normalizedMerchant));
ambiguous.sort((left, right) => right.rows - left.rows);
skipped.sort((left, right) => (right.rows ?? 0) - (left.rows ?? 0));

const ensureDirectory = (directoryPath) => {
  fs.rmSync(directoryPath, { recursive: true, force: true });
  fs.mkdirSync(directoryPath, { recursive: true });
};

const writeRuleSqlChunk = (directoryPath, chunkRows, index) => {
  const sql = `with user_scope as (
  select '${userId}'::uuid as user_id
),
rule_rows as (
  select *
  from jsonb_to_recordset($rules$${JSON.stringify(chunkRows)}$rules$::jsonb) as row(
    kind text,
    "matchTarget" text,
    "matchType" text,
    pattern text,
    "canonicalMerchant" text,
    "parentName" text,
    "categoryName" text,
    "isSharedTopup" boolean,
    priority integer,
    source text,
    notes text
  )
),
rule_categories as (
  select
    row.kind,
    row."matchTarget" as match_target,
    row."matchType" as match_type,
    row.pattern,
    row."canonicalMerchant" as canonical_merchant,
    row."isSharedTopup" as is_shared_topup,
    row.priority,
    row.source,
    row.notes,
    category.id as category_id
  from rule_rows row
  join public.categories category
    on category.level = 2
   and lower(category.name) = lower(row."categoryName")
  join public.categories parent
    on parent.id = category.parent_id
   and lower(parent.name) = lower(row."parentName")
)
insert into public.merchant_category_rules (
  user_id,
  kind,
  match_target,
  match_type,
  pattern,
  canonical_merchant,
  category_id,
  is_shared_topup,
  is_blocked,
  priority,
  source,
  notes
)
select
  user_scope.user_id,
  rule_categories.kind::public.transaction_kind,
  rule_categories.match_target,
  rule_categories.match_type,
  rule_categories.pattern,
  rule_categories.canonical_merchant,
  rule_categories.category_id,
  coalesce(rule_categories.is_shared_topup, false),
  false,
  coalesce(rule_categories.priority, 180),
  rule_categories.source,
  rule_categories.notes
from rule_categories
cross join user_scope
on conflict (user_id, kind, match_target, match_type, pattern)
do update set
  canonical_merchant = excluded.canonical_merchant,
  category_id = excluded.category_id,
  is_shared_topup = excluded.is_shared_topup,
  is_blocked = false,
  priority = excluded.priority,
  source = excluded.source,
  notes = excluded.notes,
  updated_at = now();
`;
  fs.writeFileSync(path.join(directoryPath, `rules_${index}.sql`), sql, 'utf8');
};

const writeMemorySqlChunk = (directoryPath, chunkRows, index) => {
  const sql = `with user_scope as (
  select '${userId}'::uuid as user_id
),
memory_rows as (
  select *
  from jsonb_to_recordset($memory$${JSON.stringify(chunkRows)}$memory$::jsonb) as row(
    kind text,
    "normalizedMerchant" text,
    "canonicalMerchant" text,
    "parentName" text,
    "categoryName" text,
    "isSharedTopup" boolean,
    "observationCount" integer,
    "supportRatio" numeric,
    "sampleNames" jsonb,
    "lastSeenOn" date,
    source text
  )
),
memory_categories as (
  select
    row.kind,
    row."normalizedMerchant" as normalized_merchant,
    row."canonicalMerchant" as canonical_merchant,
    row."isSharedTopup" as is_shared_topup,
    row."observationCount" as observation_count,
    row."supportRatio" as support_ratio,
    row."sampleNames" as sample_names,
    row."lastSeenOn" as last_seen_on,
    row.source,
    category.id as category_id
  from memory_rows row
  join public.categories category
    on category.level = 2
   and lower(category.name) = lower(row."categoryName")
  join public.categories parent
    on parent.id = category.parent_id
   and lower(parent.name) = lower(row."parentName")
)
insert into public.merchant_category_memory (
  user_id,
  kind,
  normalized_merchant,
  canonical_merchant,
  category_id,
  is_shared_topup,
  observation_count,
  support_ratio,
  sample_names,
  last_seen_on,
  source
)
select
  user_scope.user_id,
  memory_categories.kind::public.transaction_kind,
  memory_categories.normalized_merchant,
  memory_categories.canonical_merchant,
  memory_categories.category_id,
  coalesce(memory_categories.is_shared_topup, false),
  memory_categories.observation_count,
  memory_categories.support_ratio,
  coalesce(memory_categories.sample_names, '[]'::jsonb),
  memory_categories.last_seen_on,
  memory_categories.source
from memory_categories
cross join user_scope
on conflict (user_id, kind, normalized_merchant)
do update set
  canonical_merchant = excluded.canonical_merchant,
  category_id = excluded.category_id,
  is_shared_topup = excluded.is_shared_topup,
  observation_count = excluded.observation_count,
  support_ratio = excluded.support_ratio,
  sample_names = excluded.sample_names,
  last_seen_on = excluded.last_seen_on,
  source = excluded.source,
  updated_at = now();
`;
  fs.writeFileSync(path.join(directoryPath, `memory_${index}.sql`), sql, 'utf8');
};

const writeTransferPeopleSql = (directoryPath, transferRows) => {
  const sql = `with user_scope as (
  select '${userId}'::uuid as user_id
),
people_rows as (
  select *
  from jsonb_to_recordset($people$${JSON.stringify(transferRows)}$people$::jsonb) as row(
    name text,
    "normalizedName" text,
    "occurrenceCount" integer
  )
)
insert into public.transfer_people (user_id, name, normalized_name)
select user_scope.user_id, people_rows.name, people_rows."normalizedName"
from people_rows
cross join user_scope
on conflict (user_id, normalized_name) do nothing;
`;
  fs.writeFileSync(path.join(directoryPath, 'people.sql'), sql, 'utf8');
};

const writeSqlChunks = (directoryPath, seedPayload) => {
  ensureDirectory(directoryPath);

  const ruleChunkSize = 20;
  for (let index = 0; index < seedPayload.rules.length; index += ruleChunkSize) {
    writeRuleSqlChunk(directoryPath, seedPayload.rules.slice(index, index + ruleChunkSize), index / ruleChunkSize + 1);
  }

  const memoryChunkSize = 25;
  for (let index = 0; index < seedPayload.memory.length; index += memoryChunkSize) {
    writeMemorySqlChunk(
      directoryPath,
      seedPayload.memory.slice(index, index + memoryChunkSize),
      index / memoryChunkSize + 1,
    );
  }

  writeTransferPeopleSql(directoryPath, seedPayload.transferPeople);
};

const payload = {
  inputPath: path.resolve(inputPath),
  generatedAt: new Date().toISOString(),
  summary: {
    rowCount: rows.length,
    ruleCount: rules.length,
    memoryCount: memory.length,
    transferPeopleCount: transferPeoplePayload.length,
    skippedCount: skipped.length,
    ambiguousCount: ambiguous.length,
  },
  rules,
  memory,
  transferPeople: transferPeoplePayload,
  ambiguous: ambiguous.slice(0, 60),
  skipped: skipped.slice(0, 60),
};

if (sqlDirPath) {
  writeSqlChunks(path.resolve(sqlDirPath), payload);
}

const summaryLines = [
  `Bootstrapped ${rows.length} CSV rows`,
  `Rules: ${rules.length}`,
  `Memory: ${memory.length}`,
  `Transfer people: ${transferPeoplePayload.length}`,
  `Skipped merchants: ${skipped.length}`,
  `Ambiguous merchants: ${ambiguous.length}`,
];

console.error(summaryLines.join('\n'));
if (ambiguous.length > 0) {
  console.error('\nTop ambiguous merchants:');
  for (const item of ambiguous.slice(0, 12)) {
    console.error(
      `- ${item.merchant} (${item.rows}) -> ${item.parentName} / ${item.categoryName} @ ${item.supportRatio}`,
    );
  }
}
if (skipped.length > 0) {
  console.error('\nTop skipped merchants:');
  for (const item of skipped.slice(0, 12)) {
    console.error(`- ${item.merchant} (${item.rows ?? 1}) -> ${item.reason}`);
  }
}

const json = `${JSON.stringify(payload, null, 2)}\n`;
if (outputPath) {
  fs.writeFileSync(path.resolve(outputPath), json, 'utf8');
} else {
  process.stdout.write(json);
}

// Money and dates at the edge (copy.md): integer minor units in, Intl out. Minus is U+2212.
// Money always reads the Danish way ("1.843,50 kr.", "3,32 €"), whatever the phone's language: one format, like the bank's.
const MONEY_LOCALE = 'da-DK'
const cache = new Map<string, Intl.NumberFormat>()
function nf(currency: string, whole: boolean): Intl.NumberFormat {
  const key = currency + whole
  let f = cache.get(key)
  if (!f) {
    f = new Intl.NumberFormat(MONEY_LOCALE, { style: 'currency', currency, ...(whole ? { maximumFractionDigits: 0, minimumFractionDigits: 0 } : {}) })
    cache.set(key, f)
  }
  return f
}

let base = 'DKK'
/** The account's one base currency; set once the profile loads. */
export const setBaseCurrency = (code: string): void => { base = code }
export const baseCurrency = (): string => base

/** "1.843 kr." / "1.843,50 kr."; `whole` drops minor units for budgets and totals. */
export const kr = (minor: number, whole = false, currency = base): string => nf(currency, whole).format(minor / 100).replace('-', '−')
export const plus = (minor: number, whole = false): string => (minor > 0 ? '+' : '') + kr(minor, whole)

/** Parse a typed amount ("1500", "89,50", "1.234,5") to minor units; null when it is not an amount. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/\s|kr\.?/gi, '')
  if (!s) return null
  // A trailing ,dd or .dd is the decimal part; any other separator groups thousands.
  const m = s.match(/^(.*?)[.,](\d{1,2})$/)
  const intPart = (m ? m[1] : s).replace(/[.,]/g, '')
  const frac = m ? m[2] : ''
  if (!/^\d{1,9}$/.test(intPart || '0')) return null
  return parseInt(intPart || '0', 10) * 100 + parseInt((frac + '00').slice(0, 2), 10)
}
export const minorToInput = (m: number): string => (m % 100 ? (m / 100).toFixed(2).replace('.', ',') : String(m / 100))

const pad = (n: number): string => String(n).padStart(2, '0')
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayYmd = (): string => ymd(new Date())
export const parseYmd = (s: string): Date => { const [y, m, d] = s.split('-').map(Number); return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1) }
export const addDays = (s: string, n: number): string => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d) }
export const daysBetween = (a: string, b: string): number => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 864e5)

const fShort = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const fShortY = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const fWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
/** "3 Nov"; with the year only when it is not this year. */
export const shortDate = (s: string): string => (s.slice(0, 4) === todayYmd().slice(0, 4) ? fShort : fShortY).format(parseYmd(s))
/** "Today", "Yesterday", then "Tue 24 Nov". */
export function dayLabel(s: string): string {
  const diff = daysBetween(s, todayYmd())
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff === -1) return 'Tomorrow'
  return s.slice(0, 4) === todayYmd().slice(0, 4) ? fWeekday.format(parseYmd(s)) : fShortY.format(parseYmd(s))
}
export const range = (a: string, bInclusive: string): string => `${shortDate(a)} – ${shortDate(bInclusive)}`

/** The amount as it is being typed on the keypad ("1.234,5"), in the locale's own format with its currency sign. */
export function typedAmount(typed: string, currency = base): string {
  const [w = '', f] = typed.split(',')
  const digits = f?.length ?? 0
  const f2 = new Intl.NumberFormat(MONEY_LOCALE, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
  const parts = f2.formatToParts(Number(`${w || '0'}.${f || '0'}`))
  const dec = new Intl.NumberFormat(MONEY_LOCALE).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? ','
  let out = '', placed = false
  for (const p of parts) {
    out += p.value
    if (f !== undefined && !digits && !placed && p.type === 'integer' && !parts.slice(parts.indexOf(p) + 1).some((x) => x.type === 'integer')) { out += dec; placed = true }
  }
  return out
}

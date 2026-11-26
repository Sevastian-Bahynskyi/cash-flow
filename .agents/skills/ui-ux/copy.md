# Copy

How Cashflow's interface text and numbers read. Tells C1–C4 in `tells.md` point here.

## Voice

- **Plain and calm.** A tool the owner opens many times a day: say what is true, then get out of the way. No cheer, no nagging.
- **The app describes, it does not speak.** No "I", no mascot voice, no "Let's…".
- **AI only assists.** Never lead with "AI", never "AI-powered", "smart" or "magic". A suggestion is labelled by what it is ("Suggested: Groceries"), and it never blocks saving.
- **No judgement about spending.** Facts and the room left, not praise or guilt ("120 kr over Eating out", not "Oops! You overspent").

## Money first

Amounts
- **Integer minor units end to end.** Store, sum and compare in minor units (øre, cents). Divide only to format, at the edge. Never float arithmetic on money.
- **Format with `Intl.NumberFormat`** (`style: 'currency'`, the account's currency, the device locale). Never build a currency string by hand.
- **Whole units where precision is noise.** A budget, a total or a chart axis may drop the minor units (`maximumFractionDigits: 0`); a transaction always shows them.
- **Tabular figures in columns and live figures** (`font-variant-numeric: tabular-nums`), right-aligned so the decimal points line up. A single large hero number may use proportional figures (`dashboards.md`).
- **Minus is U+2212 (−)**, not a hyphen, when the sign is shown. `Intl` with `signDisplay: 'exceptZero'` gives the sign; check the glyph it returns.

In and out
- **Never colour alone.** Money out and money in differ by sign *and* colour, and where it matters by position or a word. A colour-blind reader, a grey-scale print and a screen reader all get it.
- **One convention, everywhere:** money out is plain (no sign, normal ink) in a list of spending; money in carries `+` and the in-colour. Over budget is a word ("over") plus the warning colour, never red text alone.
- **Transfers and shared top-ups are neither in nor out** of the month's spending: show them neutral, with their own label.
- **A change names its reference:** "+340 kr vs last cycle", never a bare arrow.

Currency
- One base currency per account. Show the symbol the locale gives (`kr.`, `€`). Name the code (`DKK`) only where two currencies meet: an import, a foreign transaction, settings.
- Do not convert silently. A foreign amount shows both: the original and what it was in the base currency.

Dates and cycles
- **Dates through `Intl.DateTimeFormat`** in the device locale. Never ISO in the UI.
- In a list: "Today", "Yesterday", then weekday and day ("Mon 24"), then a date with the month ("3 Nov"). The year only when it is not this year.
- **Salary cycles, not calendar months.** A cycle runs from one salary to the day before the next. It is named after the month it pays for (`labelForSalaryDate` in `src/lib/cycles.ts`: paid on the 25th or later → next month). Write "November cycle" or "This cycle"; never "this month" when the cycle is meant.
- **Days left counts the days the money must last** ("9 days to payday"), including today. Before the first salary is logged, say so plainly and offer the one action: log the salary.
- A cycle range is shown as "25 Oct – 24 Nov" (en dash, no year unless it crosses one).

Shared
- Fairness is inferred from top-ups and shared spending, never a typed ratio. Copy says who owes whom and how much, in one line ("Anna owes you 412 kr"), never a percentage alone.
- Use the person's name, not "partner" or "user 2".

## Rules

Titles and labels
- A title names the thing: the screen, the category, the cycle. Not a greeting.
- Sentence case. No uppercase kickers.
- Titles, labels and buttons end without a period.
- Placeholders are short nouns ("Amount", "Search"), not instructions. A field keeps a visible label.

Actions
- **One label per intent**, the same word everywhere ("Save" for a transaction, never also "Add" and "Done").
- A button says what happens, as a verb.
- `…` (U+2026) on a label that opens a follow-up step ("Delete…") and on progress ("Saving…").

Errors
- Name what failed and what to do next: "Not saved. You're offline; it will save when you're back."
- No apology, no "Oops", no "Something went wrong" alone, no raw codes.
- Inline, next to what failed. Typed amounts are never lost on an error.

Empty and waiting states
- An empty state names what will appear and offers exactly one next action ("No spending yet this cycle." + "Add a transaction").
- Loading keeps the last known numbers visible; never blank a total to zero while it reloads.

Punctuation and tone
- No em dash (—) in UI strings. An en dash (–) only in ranges.
- No `!`. Money is not a celebration.
- Contractions are fine.
- Banned: unlock, magic, smart, seamless, supercharge, AI-powered, effortless, insights (as a section name), journey, crush your goals, financial wellness.

Designed screens and pages for the owner (`taste.md` § 6)
- Short and direct. No brackets, no quotes around words, no line that only says what the thing is, no `·` separators, no badges.

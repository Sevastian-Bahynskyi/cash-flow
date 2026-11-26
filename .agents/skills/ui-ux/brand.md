# Cashflow brand and style: Soft

The look since 26 Nov 2026. It replaces Two inks (direction E, picked 26 Nov) after the owner used the real app with real data and asked for "something softer and something that is easier to perceive", components that "build trust", "like Revolut and Lunar does", "all these rounded corners". The structure stayed: same screens, nav, flows and features. The general layer (what slop is, how design work runs) stays in [`taste.md`](taste.md). Changing a rule here needs the owner.

What the owner asked of the app, in their words (26 Nov): "track my money, lets me create budgets, let me see whether I follow budgets, gives me a good overview of my transactions, and have the overview of our shared account", and "It should be very clear and identify what is the shared transaction, what is my own transaction." The look serves exactly that. A reference the owner likes is judged for its look only: nothing here is a feature request.

## The idea

Calm, round and plain-spoken, like a good banking app. Your cycle between paydays is one soft indigo card with what is left and a running total of spending that grows day by day. Everything else is white (or near-black) panels on a cool grey ground. Numbers are big, sans and easy to read. Nothing shouts: a budget that is over is said in words on a calm grey bar.

## Colour

**The rule: two people, two colours.** Indigo is you, saffron is the person you share with. Anything shared carries both: two overlapping dots. Green appears only for money coming in, always with a `+`. Over a budget is a calm grey bar and the words "… over" in a muted rose; never a red card, red badge or red hatching. Everything else is ink on grey. Colour never decorates (`taste.md` § 3); the one exception is the five category hues in the Where-it-went square, which only tell categories apart.

All values live as tokens in `web/app/globals.css`; this table names their jobs.

| Token | Light | Dark | Job |
|---|---|---|---|
| `ground` | `#F2F3F7` | `#0C0D12` | page |
| `surface` / `surface-2` / `surface-3` | `#FFFFFF` / `#EDEFF4` / `#E3E6EE` | `#191A22` / `#23252F` / `#2C2E3A` | panels; icon discs, tracks; pressed |
| `raised` | `#FFFFFF` | `#383B4C` | the chosen segment of a segmented control |
| `line` / `line-2` | ink 7% / 14% | white 6% / 13% | hairlines |
| `ink` / `ink-2` / `ink-3` | `#151829` / `#4D5267` / `#62677D` | `#F1F2F7` / `#B9BBCB` / `#9194A8` | text steps |
| `you` → `you-2` | `#4A4ED6` → `#3C40BE` | `#5155D8` → `#3E41B4` | the cycle card's gradient, buttons |
| `you-text` / `you-mark` / `you-soft` | `#3D41C4` / `#4A4ED6` / `#E7E8FB` | `#AFB2FF` / `#8487F7` / `#2A2C52` | indigo as text, bars and marks, tint |
| `anna` / `anna-text` | `#EFA83F` / `#875600` | `#F2B455` / `#F5C67A` | the partner's colour |
| `over-bar` / `over-text` / `over-soft` | `#A3A8B9` / `#9C4A3E` / `#F6EDEB` | `#6A6F84` / `#EBAA9F` / `#2E2324` | a budget past its line; error notes |
| `in` / `in-soft` | `#1B7A4B` / `#E3F3EA` | `#7AD7A4` / `#1C2E25` | money in only |
| `ahead-text` / `ahead-soft` | `#9A5414` / `#FBF1E4` | `#F0B27A` / `#2E271D` | "ahead of the days", sync warnings |
| `cat1`–`cat5` | indigo, blue, teal, orchid, slate | lighter in dark | Where it went's square only |

Dark is tuned, not inverted: a near-black ground, panels one step up, lighter indigo for marks. Contrast is AA for every text pair.

## Budgets: three states, said in words

| State | Bar | Words at the row's end |
|---|---|---|
| Within the budget | indigo `you-mark`, a short `ink-3` line at today | "62 kr. left" in ink |
| Ahead of the days (spent a bigger share than the share of the cycle gone) | the same indigo bar; the today line shows it | "62 kr. left, ahead" in `ahead-text` |
| Over | the whole bar `over-bar` grey, with a gap where the budget ended | "87 kr. over" in `over-text` |

Bars are round, 8px in lists and 12px on a card. No hatching, no hand-drawn strokes, no badges behind the words.

## The cycle card

Big number: what is left in the budgets (or in minus out with no budgets). Under it, a 128px running total of spending so far: a soft white area for yours, saffron at its foot for your part of shared, a white line on top and a dot at today; the budgets as a dashed ceiling with its amount, and an even pace as a dashed diagonal from zero to the ceiling. Above the line means spending ahead of the days. Labels: start, Today, end of cycle.

## Type and figures

- **Hanken Grotesk** 400/500/600 for everything, numbers too: big numbers 600 with tight tracking (−0.03em). No serif, no italics. Sentence case, no uppercase kickers.
- Money through `kr()` in `web/lib/fmt.ts`, always the Danish format whatever the phone's language: "1.843 kr.", "1.843,50 kr.", "3,32 €". `tabular-nums` in every column, right-aligned.
- Scale (phone): card number 52 (64 desktop), detail number 48, section numbers 26–36, section titles 16/600, list names 16, body 15, meta 13, small 12.

## Shape and surface

- Radii by role: cards 28, panels and lists 22, inputs 16, buttons, segments, search, chips and toasts fully round.
- Lists are panels of rows split by faint hairlines, not cards in cards. Every row leads with a 40px round disc holding its icon on `surface-2`; a shared row carries the two dots on the disc's corner.
- Depth from surface steps, one very soft shadow under panels in light mode, and a soft coloured shadow under the cycle card. The only gradient is the card's own indigo.
- The phone tab bar is frosted (`surface` 86% with blur); the current tab's icon sits in a soft indigo pill.

## Icons and pictures

Our own system, simple and soft (owner, 26 Nov): **B, Soft fill**, a 1.7 line with round ends, and a soft wash of the same colour (20%) inside each body. 24 grid, live area 3–21, round ends and joins, one geometry per meaning (`docs/redesign/icons/icons.js`), tinted with the neighbouring text, never an emoji, never a brand logo drawn by us.

The people marks are not icons: two overlapping dots, saffron and indigo, is shared; an open saffron ring with an arrow is money moved.

## Motion

After Save the sheet closes, you are back where you started with an Undo toast. Routine screens appear at once; nothing replays on re-entry (`taste.md` § 5, `tells.md` M1). Reduced motion turns every animation off.

## Screens the owner loves

Filled from the owner's notes.

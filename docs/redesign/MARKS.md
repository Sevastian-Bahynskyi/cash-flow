# Colour and marks: what makes Cashflow easy to scan

Owner, 26 Nov 2026: three budget states with colour are fine; more colour or marks so the app is not "just gray", easier on the eye to scan, creative, outstanding; hand-drawn lines may mark things (sketch: rough red diagonal hatching). Nothing here adds a feature.

## The rule

Colour and marks carry **meaning**, never decoration, and every meaning has a word next to it (copy.md). One meaning, one look, on every screen.

| Meaning | Colour token | Mark | Word |
|---|---|---|---|
| You, on track | `--you` indigo | solid bar | "left" |
| Ahead of pace (spent a bigger share of a budget than the share of the cycle gone) | `--ahead` orange, `--ahead-text`, `--ahead-soft` | hand-drawn **hatch** on the part past today's tick | "ahead" |
| Over a budget line | `--over-*` red | whole bar red, **hatched** | "over" |
| Today / the point in the cycle | `--ink` | hand-drawn **tick** on every budget bar; rough **ring** around today's day | "Today" |
| Shared with the partner | `--anna` saffron + `--you` | the two overlapping dots | "shared" |
| Money in | `--in` green | `+` | "In" |
| Money moved (pot, savings): not spending | ink-2, neutral | open ring with arrow | "Moved" |
| More than last period (analytics) | ink | ink **hatch** on the part of a bar past last period's tick | "more than …" |
| A budget kept / a goal reached | `--in` | hand-drawn **check** | "kept", "reached" |
| The one number that matters on a screen | current text colour | hand-drawn **underline**, once per screen at most | — |

Categories get no colours: their icon and name identify them (Two inks: colour means a person or a state).

## Building blocks

`web/components/Marks.tsx`: `Meter` (budget bar with tick, ahead and over hatching), `budgetState`, `StatePill`, `Underline`, `Check`, `Ring`, `roughPath`. CSS in `web/app/globals.css` (`.mk-*`, `.hatch` as a mask so it takes any `background` colour, `.pill.ahead`). Strokes use a fixed seed: they look hand-drawn and never jitter between renders.

## Limits

- At most one underline per screen. Hatching only where a line was crossed (over, ahead, more than last).
- Contrast AA in both themes; red/orange always with their word. Reduced motion: marks never animate.

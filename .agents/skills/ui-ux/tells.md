# Tells

The catalog of signs that make a Cashflow screen read as AI-generated, templated or careless. Use it while building (do not produce these), in a polish pass, and as rule IDs in a review.

A tell is a lead, not a verdict: confirm it on the rendered screen. A tells list is a floor, never a direction (`taste.md` § 1). Anything listed in [`exemptions.md`](exemptions.md) within its scope and quota is not a finding.

## How to read an entry

- **ID** is stable. Cite it in findings and commits (`V1`, `D3`). Never renumber; retire an ID by marking it retired.
- **Evidence:** `grep` (code alone proves it), `screenshot` (one still frame), `running app` (needs interaction, a re-entry, the keyboard, offline).
- **Default** is the starting severity: P1 blocks a task or misleads about money, P2 visibly wrong, P3 polish.

Prefixes: `V` visual, `D` data and money, `S` structural, `N` navigation, `M` motion, `C` copy, `B` behaviour and state.

## Visual

**V1 Gradient on chrome or controls.** A gradient on buttons, chips, cards, the balance card, tab icons or headers. "Cheap gradients, cheap buttons" (`taste.md` § 2).
Evidence: grep, then screenshot. Default: P2.
Fix: a solid fill from the tokens. Depth comes from surface steps.

**V2 Coloured glow or tinted border.** A coloured shadow, halo or 1px tinted border around a card, button or number.
Evidence: grep, then screenshot. Default: P2.
Fix: a neutral shadow step or a hairline; no colour that means nothing.

**V3 Fintech wallpaper.** Mesh, aurora, blurred orbs, a dark-mode neon "crypto" look, a 3D coin or card illustration, glass cards over a blurred blob.
Evidence: screenshot. Default: P2.
Fix: the screen's own data is the richness. One quiet ground.

**V4 Heavy display and shouting labels.** Weight 800–900 display, uppercase tracked kickers ("TOTAL BALANCE", "RECENT TRANSACTIONS").
Evidence: grep, then screenshot. Default: P3, reported once as a pattern.
Fix: sentence case; hierarchy from size steps and ink, not weight and caps.

**V5 Raw colour.** Hex, `rgb()` or Tailwind defaults (`#22c55e` green, `#ef4444` red, `#3b82f6` blue) outside the token file, or a colour that breaks when the theme flips.
Evidence: grep for literals; screenshot both themes. Default: P3; P2 when one theme is broken.
Fix: a token. Missing token: propose one, never a local palette.

**V6 Pill everything.** The same full radius on inputs, cards, rows, banners and buttons.
Evidence: screenshot. Default: P3.
Fix: radius by role from `brand.md`.

**V7 Emoji or mixed icon families.** Emoji as category icons ("🍔 Food"), status or empty-state art; filled and line icons mixed; 3D clip-art beside a flat UI; one icon for two meanings.
Evidence: grep, then screenshot. Default: P2 when three families share a screen, else P3.
Fix: one icon family, one size per context, tinted with the neighbouring text. Category identity is the category's mark and name, never an emoji.

**V8 Card stack and icon-chip grid.** Every section a card, cards in cards, every row led by an icon in a tinted circle, a 2×2 grid of equal "quick action" tiles.
Evidence: screenshot. Default: P3; P2 on Home.
Fix: one lead element; lists are lists, separated by hairlines or space, not boxes.

**V9 Low contrast.** Text or icons below WCAG AA, grey-on-grey secondary amounts, the in/out colour too light to read as text.
Evidence: screenshot plus a contrast check. Default: P1 for amounts and primary actions, else P2.
Fix: the ink token for that surface; an in/out colour has a text-safe step.

## Data and money

**D1 Colour-only sign.** In and out told apart by green and red alone; over budget only by a red bar.
Evidence: screenshot in grey scale. Default: P1.
Fix: sign plus colour plus, where it matters, a word or position (`copy.md` § In and out).

**D2 Jittering or misaligned figures.** Proportional digits in a column, amounts left-aligned, decimals that do not line up, a total that shifts width while it counts.
Evidence: screenshot. Default: P2.
Fix: `tabular-nums`, right-aligned, the same number of fraction digits within a column.

**D3 Decorative chart.** A sparkline, donut or bar that answers no question, a chart on every card, a chart where one number would do.
Evidence: screenshot. Default: P2.
Fix: the one number, or a chart that answers one stated question (`dashboards.md`).

**D4 Stat triplet.** Three or four equal stat cards across the top ("Income / Expenses / Savings / Balance"), all the same weight.
Evidence: screenshot. Default: P2 on Home.
Fix: one number that matters; the rest supporting, smaller, or one tap away.

**D5 Calendar month where the cycle is meant.** "This month", 1st to 31st ranges, a month picker on a cycle screen.
Evidence: screenshot, grep for month labels. Default: P1 (product rule).
Fix: salary cycles everywhere (`copy.md` § Dates and cycles).

**D6 Float money.** Amounts stored, summed or compared as floats; `toFixed` to format; a typed amount parsed with `parseFloat` and kept.
Evidence: grep. Default: P1.
Fix: integer minor units; `Intl.NumberFormat` at the edge.

**D7 Fake precision and false alarms.** Percentages to one decimal, "spending up 3.2%" on noise, a red warning on a budget that is merely on pace.
Evidence: screenshot. Default: P3; P2 when it alarms.
Fix: whole numbers; warn only when pace or total crosses a real line.

**D8 Slow add path.** More than amount → category → name → save on the happy path; a field that must be filled that could default; the amount field not focused with the numeric keypad on open; AI suggestion blocking Save.
Evidence: running app, count taps. Default: P1.
Fix: the order in `AGENTS.md`; date, note and split stay off the happy path.

## Structural

**S1 Hand-rolled header or lost Back.** A screen title without a Back that returns where the person was; browser Back that leaves the app or skips a step.
Evidence: running app (open by link and by tap). Default: P2; P1 if a flow is lost.
Fix: one header per screen; routes that the browser history understands.

**S2 Sheet or dialog without the basics.** A modal closed only by an X, no Escape, no focus trap, no swipe down on phone, background still scrolls.
Evidence: running app. Default: P2.
Fix: one sheet/dialog component that does all of it.

**S3 Content under chrome.** Content under the status bar, the home indicator or a fixed bottom bar in the installed PWA; hand-typed `padding-top: 44px`.
Evidence: screenshot in standalone mode. Default: P1 if unreachable, else P2.
Fix: `env(safe-area-inset-*)` and `viewport-fit=cover`.

**S4 Keyboard blindness.** On iPhone Safari the focused field or Save sits behind the keyboard; the page jumps; the amount keypad is the full keyboard.
Evidence: running app on an iPhone-size Safari. Default: P1 on the add path, else P2.
Fix: `inputmode="decimal"`, `enterkeyhint`, layout that follows the visual viewport.

**S5 Zoom or large text broken.** At 200% zoom or large text, amounts clip, rows overlap or Save leaves the screen; `user-scalable=no` used to hide it.
Evidence: screenshot at 200%. Default: P1 if a task is blocked, else P2.
Fix: fluid layout, `min-height` not `height`, wrapping rows.

**S6 Unnamed or tiny control.** A clickable `div`, an icon button with no name, a target under 44px, a selection with no selected state.
Evidence: grep, then the accessibility tree. Default: P1 for a primary control, else P2.
Fix: a real `button` or `a`, an accessible name that starts with the visible words, `aria-pressed` / `aria-selected`.

## Navigation

**N1 Template dashboard shell.** A left sidebar with ten icons, a top bar with search, bell and avatar, on a personal app with four places.
Evidence: screenshot at desktop width. Default: P2.
Fix: the app's own few places; desktop widens the content, it does not add admin chrome.

**N2 Floating pill tab bar with a glowing centre button.**
Evidence: screenshot. Default: P2.
Fix: the add action has its own clear place without a glowing orb.

## Motion

**M1 Grand entrance.** Staggered fade-in on routine screens and lists, numbers counting up on every visit.
Evidence: running app (leave and re-enter). Default: P3; P2 when it delays a tap.
Fix: routine screens appear at once; a count-up only when a number really changed.

**M2 Loop on something not live.** A pulsing button, a breathing card, a shimmering balance.
Evidence: running app. Default: P3.
Fix: the static end state.

## Copy

**C1 Hype and AI in the foreground.** "AI-powered insights", "Smart budget", exclamation marks, a greeting as the title ("Good morning, Seva 👋").
Evidence: grep, then screenshot. Default: P3.
Fix: `copy.md`.

**C2 Glossary drift.** One concept under two names (cycle / month / period; spending / expenses / outflow; budget / limit).
Evidence: grep, then screenshot. Default: P2.
Fix: one term per concept, as `copy.md` and the product rules name it.

**C3 Error without a way out.** "Something went wrong", `alert()`, a raw Supabase error, a lost typed amount.
Evidence: grep, then running app offline. Default: P2; P1 on the add path.
Fix: `copy.md` § Errors.

**C4 Raw formats.** ISO dates, `1234.5`, `DKK 1234.50` built by hand, "1 days".
Evidence: screenshot. Default: P3; P2 on amounts.
Fix: `Intl`, plural rules.

## Behaviour and state

**B1 Missing or lying states.** A spinner over the whole screen, totals that flash 0 kr before data arrives, an empty list with no next action, a chart with no empty state, a sync that never resolves.
Evidence: running app (first load, refetch, offline, a new account). Default: P2; P1 when a number is wrong while loading.
Fix: loading, empty, error and content for every list and chart; keep stale numbers while refetching.

**B2 Browser dialog as UI.** `alert`, `confirm` for routine undoable actions or success.
Evidence: grep. Default: P3; P2 on the add path.
Fix: success updates the UI; undo for reversible actions; a designed confirm only for rare irreversible ones.

## Template test

Swap "Cashflow" for any other app's name and blank the numbers. If the screen still fits a bank, a fitness app or an admin template, it has no decision in it yet. Push the focal number, the words and the layout toward the owner's own month: payday, days left, what is left to spend, their categories, the person they share with.

## Never swap one trend for another

Removing a tell is not a licence to add the next default: cream paper with a serif display, a dark terminal look, glassmorphism, or a palette nobody chose. A fix uses existing tokens or a token proposal tied to the owner's pick (`brand.md`). Removing tells is not design either: `taste.md` § 1.

## Polish pass

1. **Audit.** Screenshot the screen at 390px and 1280px, light and dark; list every tell with its ID.
2. **Triage.** Heavy: show the list first, then fix all. Light: fix those only. None: say so; propose at most three refinements.
3. **Fix in passes** across the whole screen: spacing, colour, figures, icons, copy, type, layout, states, motion.
4. **Template test** (above).
5. **Verify.** Screenshot again; done when no tell from step 1 remains and `SKILL.md` § Visual acceptance passes.

## Growth rule

Add a tell only after the same failure shows up on two or more screens or sessions. Keep the core near 30; merge or move the weakest to the appendix.

## Appendix: lower-frequency tells

- **One spacing value everywhere,** so proximity means nothing.
- **Wireframe borders** on every container.
- **Badge confetti:** "New", "Pro", counts on many rows.
- **Placeholder as label** on amount and name fields.
- **Equal-weight actions:** two solid buttons, or Delete styled like Save.
- **Helper-text bloat:** a grey line under every title restating it.
- **Repeated label:** tab, header and first section say the same word.
- **Side stripe:** a thick coloured left border on a card or a row.
- **Poster screen:** a data screen centred vertically.
- **Generated imagery** in the UI or the app icon.
- **Infinite list without grouping:** transactions with no day headers or no running sense of the day's total.
- **Hover-only information** on a touch screen.

---

Credits. Adapted for a web money app from CoupleGoAI's `tells.md`, which merged Expo `native-slop.md` (MIT), Draftbit `mobile-taste-skill` (MIT, Copyright (c) 2026 Draftbit) and unslop by Damir Sokolovsky ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). Changes: native-only tells removed, money and data tells added, fixes rewritten for the web.

# Cashflow brand and style: Soft

The look since 26 Nov 2026. It replaces Two inks (direction E, picked 26 Nov) after the owner used the real app with real data and asked for "something softer and something that is easier to perceive", components that "build trust", "like Revolut and Lunar does", "all these rounded corners". The structure stayed: same screens, nav, flows and features. The general layer (what slop is, how design work runs) stays in [`taste.md`](taste.md). Changing a rule here needs the owner.

What the owner asked of the app, in their words (26 Nov): "track my money, lets me create budgets, let me see whether I follow budgets, gives me a good overview of my transactions, and have the overview of our shared account", and "It should be very clear and identify what is the shared transaction, what is my own transaction." The look serves exactly that. A reference the owner likes is judged for its look only: nothing here is a feature request.

## The idea

Calm, round and plain-spoken, like a good banking app. Your cycle between paydays is one solid ink-blue card with what is left and a running total of spending that grows day by day. Everything else is white (or graphite) panels on a neutral grey ground. Numbers are big, sans and easy to read. Nothing shouts: a budget that is over is said in words on a calm grey bar.

**No purple, no slop** (owner, 26 Nov: "not purple because it's the sign of AI slop [...] avoid slop at all the cost"). Before any colour or effect choice, read `tells.md` and the CoupleGoAI anti-slop research (`~/Developer/CoupleGoAI/couplegoai/docs/research/ui-ux-anti-slop-2026-11/00-SYNTHESIS.md`, `B-color-identity.md`). In short: no indigo or violet, no gradients on cards or controls (V1), no coloured glow or shadow (V2), no glass or frosted bars (V3), neutrals with almost no chroma do most of the work, one saturated object per screen, and never swap purple for the next default (cream ground, serif display, terracotta).

## Colour

**The rule: two people, two colours.** Ink blue is you (the colour of a pen signature on a bank form), saffron is the person you share with. Anything shared carries both: two overlapping dots. Green appears only for money coming in, always with a `+`. Over a budget is a calm grey bar with a darker grey tail and the words "… over" in a muted rose; never a red card, red badge or red hatching. Everything else is ink on grey. Colour never decorates (`taste.md` § 3); the one exception is the five category hues in the Where-it-went square, which only tell categories apart.

All values live as tokens in `web/app/globals.css`; this table names their jobs.

| Token | Light | Dark | Job |
|---|---|---|---|
| `ground` | `#F2F3F4` | `#17181B` | page (dark at OKLCH L≈19, not pure black) |
| `surface` / `surface-2` / `surface-3` | `#FFFFFF` / `#ECEDEF` / `#E2E4E7` | `#212226` / `#2B2D32` / `#35373D` | panels; icon discs, tracks; pressed |
| `raised` | `#FFFFFF` | `#43464D` | the chosen segment of a segmented control |
| `line` / `line-2` | ink 8% / 15% | white 7% / 14% | hairlines |
| `ink` / `ink-2` / `ink-3` | `#16181C` / `#4A4E57` / `#5F636C` | `#F2F2F3` / `#BDBFC5` / `#9A9DA5` | text steps |
| `you` | `#1F3A5C` | `#22406A` | the cycle card (solid), buttons |
| `you-text` / `you-mark` / `you-soft` | `#23497A` / `#2C5A92` / `#E2E9F2` | `#9EBEE8` / `#6E9BD6` / `#25313F` | blue as text, bars and marks, tint |
| `anna` / `anna-text` | `#EFA83F` / `#875600` | `#F2B455` / `#F5C67A` | the partner's colour |
| `over-bar` / `over-text` / `over-soft` | `#80858F` / `#9C4A3E` / `#F6EDEB` | `#70747D` / `#EBAA9F` / `#33282A` | a budget past its line; error notes |
| `in` | `#1B7A4B` | `#7AD7A4` | money in only |
| `ahead-text` / `ahead-soft` | `#9A5414` / `#FBF1E4` | `#F0B27A` / `#33291E` | "ahead of the days", sync warnings |
| `cat1`–`cat5` | ink blue, sky, raspberry, slate, pale slate | lighter in dark | Where it went's square only; told apart by lightness too |

Dark is tuned, not inverted: a graphite ground, panels one step lighter (elevation by lightness, no shadows), a lighter blue for marks. Contrast is AA for every text pair; bars and the over tail are at least 3:1.

## Budgets: three states, said in words

| State | Bar | Words at the row's end |
|---|---|---|
| Within the budget | blue `you-mark`, a short `ink-3` line at today | "62 kr. left" in ink |
| Ahead of the days (spent a bigger share than the share of the cycle gone) | the same blue bar; the today line shows it | "62 kr. left, ahead" in `ahead-text` |
| Over | `over-bar` grey up to where the budget ended, then a darker `ink-2` tail for the part over | "87 kr. over" in `over-text` |

Bars are round, 8px in lists and 12px on a card. No hatching, no hand-drawn strokes, no badges behind the words.

## The cycle card

Big number: what is left in the budgets (or in minus out with no budgets). Under it, a 128px running total of spending so far: a soft white area for yours, saffron at its foot for your part of shared, a white line on top and a dot at today; the budgets as a dashed ceiling with its amount, and an even pace as a dashed diagonal from zero to the ceiling. Above the line means spending ahead of the days. Labels: start and end of the cycle, and Today when there is room.

## The second look: Bright

The owner liked two of three prototyped looks (26 Nov) and wants to live with both before choosing: "implement both A and B [...] in the settings I switch to B and show the whole app in this style". Soft stays the default; **Settings > Look** switches to Bright, saved on the device (`web/lib/look.ts`, `<html data-look="bright">`). All of Bright lives in `web/app/bright.css` as token and shape overrides; screens and features are the same.

- Inspired by Headspace's energy, not its branding: big flat colour blocks, big chunky type (Bricolage Grotesque, 800 only on the numbers that are the point), white ground (near-black in dark).
- Cobalt `#2350F5` is you (the cycle card, bars, icon tiles), sunflower `#FFC42E` is the partner (the pot block, the days-gone bar). Over a budget is the solid ink tile with the words "… over" (black in light, near-white in dark); still no red.
- The cycle card shows two thick bars, money used against days gone, instead of the running-total chart. On a phone, budgets and "Needs a look" are a grid of tiles.
- Same bans as Soft: no purple, no gradients, glow or glass.

When the owner picks one, delete the other (its CSS, the switch, the race bars or the chart) rather than keeping both.

## Type and figures

- **Hanken Grotesk** 400/500/600 for everything, numbers too: big numbers 600 with tight tracking (−0.03em). No serif, no italics. Sentence case, no uppercase kickers.
- Money through `kr()` in `web/lib/fmt.ts`, always the Danish format whatever the phone's language: "1.843 kr.", "1.843,50 kr.", "3,32 €". `tabular-nums` in every column, right-aligned.
- Scale (phone): card number 52 (64 desktop), detail number 48, section numbers 26–36, section titles 16/600, list names 16, body 15, meta 13, small 12.

## Shape and surface

- Radii by role: cards 28, panels and lists 22, inputs 16, buttons, segments, search, chips and toasts fully round.
- Lists are panels of rows split by faint hairlines, not cards in cards. Every row leads with a 40px round disc holding its icon on `surface-2`; a shared row carries the two dots on the disc's corner.
- Depth from surface steps and a hairline-soft neutral shadow under panels in light mode; none in dark. No gradients, no coloured shadows, no glass.
- The phone tab bar is a plain `surface` bar; the current tab's icon sits in a soft `you-soft` pill.

## Icons and pictures

Our own system, simple and soft (owner, 26 Nov): **B, Soft fill**, a 1.7 line with round ends, and a soft wash of the same colour (20%) inside each body. 24 grid, live area 3–21, round ends and joins, one geometry per meaning (`docs/redesign/icons/icons.js`), tinted with the neighbouring text, never an emoji, never a brand logo drawn by us.

The people marks are not icons: two overlapping dots, saffron and blue, is shared; an open saffron ring with an arrow is money moved.

## Motion

After Save the sheet closes, you are back where you started with an Undo toast. Routine screens appear at once; nothing replays on re-entry (`taste.md` § 5, `tells.md` M1). Reduced motion turns every animation off.

## Screens the owner loves

Filled from the owner's notes.

# Cashflow brand and style: Two inks

Picked by the owner on 2026-11-26 from five clickable directions: "E, but desing our own simple soft icon system". E is Two inks (`docs/redesign/directions/c1`, its `README.md` and `app.html` are the source for every value below). The general layer (what slop is, how design work runs) stays in [`taste.md`](taste.md). Changing a rule here needs the owner.

What the owner asked of the app, in their words (26 Nov): "track my money, lets me create budgets, let me see whether I follow budgets, gives me a good overview of my transactions, and have the overview of our shared account", and "It should be very clear and identify what is the shared transaction, what is my own transaction." The look serves exactly that. "I only judged by the look of the app and the design what I liked and what I didn't like" (26 Nov): nothing here is a feature request.

## The idea

Your month between paydays is something you hold: a deep indigo card with what is left, drawn from the days you have lived through. The shared part is two people in two colours, you and your partner. Someone glancing at the screen sees at once that it is about this cycle's money and how long it must last.

## Colour

**The rule: two people, two colours.** Indigo is you, saffron is the person you share with. Anything shared carries both: two overlapping dots. Red appears only where a budget line was crossed, always with the word "over". Green appears only for money coming in, always with a `+`. Everything else is ink on a warm grey ground. Colour never decorates (`taste.md` § 3).

| Token | Light | Dark | Job |
|---|---|---|---|
| `ground` | `#E9E8E4` | `#0E0F16` | page |
| `surface` / `surface-2` | `#FAFAF8` / `#F1F0EC` | `#181925` / `#20212F` | lists, panels, pressed |
| `line` / `line-2` | ink 10% / 18% | white 8% / 16% | hairlines |
| `ink` / `ink-2` / `ink-3` | `#17182B` / `#4F5264` / `#666979` | `#ECECF3` / `#B5B7C8` / `#9496AB` | text steps |
| `you` / `you-deep` | `#2D2F8F` / `#23246F` | `#3A3DA6` / `#2C2E86` | the cycle card, Add, your marks |
| `you-text` / `you-mark` / `you-soft` | `#2D2F8F` / `#2D2F8F` / `#DFE0F3` | `#AEB1FF` / `#7E82F2` / `#2A2C5A` | indigo as text, small marks, tint |
| `anna` / `anna-text` | `#E7A53C` / `#8A5800` | `#F0B04A` / `#F3C06E` | the partner's colour |
| `over-fill` / `over-card` / `over-text` / `over-soft` | `#B4352B` / `#A9322A` / `#B4352B` / `#F5DEDA` | `#C4463B` / `#8F2C25` / `#FF948A` / `#3A1E1E` | crossed budget only |
| `in` | `#1D7646` | `#74D6A0` | money in only |

Dark is tuned, not inverted: an indigo-black ground, a lighter indigo for small marks, the same rich cards.

## Type and figures

- **Newsreader** (serif, optical sizes) for the big numbers and the one-sentence answers; its italic for the human part ("*4 days to payday*").
- **Hanken Grotesk** 400/500/600 for the interface. Sentence case, no uppercase kickers.
- Amounts through `Intl.NumberFormat` with the account's currency (fake data: `en-DK`, DKK, "1.843 kr."); `tabular-nums` in every column, right-aligned. The hero number may use proportional figures.
- Scale (phone): hero 56–68 (88 on desktop), section numbers 30, list names 17, screen title 16/600, body 15, meta 13, small 11–12.

## Shape and surface

- Radii by role: the cycle card 24, panels and lists 18, controls 12–16, chips full round only for small toggles.
- Lists are panels of rows split by hairlines, not cards in cards.
- Depth from surface steps and one soft neutral shadow on the cycle card; no gradients, no coloured glow.
- The over card is the only other solid object: red, with the word "over".

## Icons and pictures

Our own system, simple and soft, replacing the direction's icons (owner, 26 Nov). The owner picked **B, Soft fill** (26 Nov) from three whole systems on the choices page: a 1.7 line with round ends, and a soft wash of the same colour (20%) inside each body. Rules: 24 grid, live area 3–21, round ends and joins, one geometry per meaning (`docs/redesign/icons/icons.js`), tinted with the neighbouring text, never an emoji, never a brand logo drawn by us (brand categories map to the nearest own icon).

The people marks are not icons: a filled indigo dot is yours, an indigo dot over a saffron dot is shared, an open ring with an arrow is money moved.

## Motion

From the direction: after Save the sheet closes, you are back where you started with an Undo toast, and today's bar grows on the card. Routine screens appear at once; nothing replays on re-entry (`taste.md` § 5, `tells.md` M1).

## Screens the owner loves

Filled from the owner's notes on the prototype.

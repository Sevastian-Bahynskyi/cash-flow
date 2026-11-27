# Dashboards, charts and numbers

How Cashflow shows data. Based on the `dataviz` skill's method and on what well-loved finance apps do (Copilot Money, Monarch, YNAB, Lunch Money, Apple Card). When the host has the `dataviz` skill, load it before writing chart code; this file is the Cashflow layer on top.

## One number that matters per screen

- Each screen has one number the owner came for, set larger than everything else. Home: what is left to spend this cycle (or days to payday with it). A category: spent against its budget. Analytics: the answer to its one question.
- Everything else supports it: smaller, quieter, or one tap away. Never a row of equal stat cards (`tells.md` D4).
- A number always carries its context in words: "left of 14 000 kr", "9 days to payday". A bare figure is not information.
- A large standalone number uses proportional figures; numbers in columns use tabular figures (`copy.md`).

## A chart answers one question

- Write the question first ("Am I spending faster than last cycle?", "Where did the money go?"). If you cannot, do not draw a chart.
- The question picks the form:
  - **Pace through the cycle:** a cumulative line of this cycle against a reference (last cycle or an even pace), one highlighted series, the rest grey.
  - **Where it went:** a sorted horizontal bar list with labels and amounts. Not a donut for close values, never a pie with more than a few slices.
  - **Change over cycles:** columns per cycle, the current one emphasised.
  - **Budget state:** a single bar or meter per category, with the amount in words beside it.
  - **A single headline:** no chart, a number.
- **No decorative charts.** No sparkline on every card, no chart where a number does, no 3D, no gradient fills under lines.

## Marks and colour

- Thin marks, recessive axes, no dashed gridlines, no dual y-axis ever.
- Colour by job: one hue for magnitude; emphasis (one series in the accent, the rest grey) before categorical colour.
- Category colours, when used, follow the category, never its rank, and fold past seven into "Other".
- Over budget and warnings use the reserved status colours with a word or an icon, never colour alone.
- Validate any categorical palette with the `dataviz` validator before it ships; light and dark are each chosen, not flipped.
- Text stays in ink colours; the coloured mark beside it carries identity.

## Interaction

- Every chart has a way to read exact values without hover: direct labels on what matters, and a list or table beneath or one tap away. Hover is a bonus on desktop, never the only way on a phone.
- Touch targets larger than the mark. A tap on a bar or point shows its value and the transactions behind it.
- One cycle selector for the screen, in one place above the charts, not a filter inside each chart.

## States for every list and chart

Each list and chart is designed in all four states before it is done:

- **Loading:** the layout holds its shape; the last known numbers stay while refetching; no skeleton flash on refetch; never 0 kr while loading.
- **Empty:** says what will appear and gives one action ("No spending yet this cycle." + Add). A chart with too little data (two days into a cycle) says so instead of drawing a misleading line.
- **Error:** names what failed, keeps what is known visible, offers Retry.
- **Content,** including stress: a huge month, a 1 kr transaction, a category name of forty characters, 300 transactions in a cycle, a negative balance.

## What the owner's marks teach (references board, 26 Nov)

The marks are in `docs/design/owner-taste-evidence.md` § Cashflow.

- **Loved:** money as a confident object (Apple Card, Revolut's big balance), a tactile control that makes money concrete (Apple Card's interest dial), people in the shared part (Revolut's joint account, payments as a chat), calm dense structure (Linear), a picture that answers "where did it go" (Monarch's Sankey), budgets as rows with the amount available in a coloured pill (YNAB) or aligned columns (Copilot), overspending shown with its next step (YNAB).
- **Hated:** monospace terminal ledgers (Lunch Money), pale airy minimalism (Mercury, Things), generic fintech (Emma, Rocket), AI suggestion queues and insight cards (Copilot).

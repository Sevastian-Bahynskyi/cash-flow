# b1: Meter Bridge

**Idea:** the cycle is read like a hardware instrument face: one saffron panel with the money left in big condensed figures and two meters, Days and Flexible spending, on the same 31-segment scale, so you see at a glance when spending runs ahead of the days.

## References it builds on

- **Apple Card, Wallet (applecard-02) and installments bar (applecard-06):** one object that holds the balance and the payment date side by side; paid against remaining as one plain bar. Taken: the panel as a single tactile object, and money left next to the payday.
- **YNAB, cover overspending (ynab-05) and plan (ynab-03):** overspending as a red card with the next step; available money in a coloured pill at the row end. Taken: the red "Over budget" card where each row opens its category, and the left/over pills in the budget table.
- **Copilot, budget table (copilot-03):** category, spent, budget in right-aligned columns with the total once underneath. Taken: the budgets table and its single total line.
- **Monarch, budget bars (monarch-03):** spent and remaining in words beside one bar. Taken: every meter carries its amount in words.
- **Revolut, joint account (revolut-04):** two people on the shared balance. Taken: the two initials on the shared card, the shared account as its own object.

## Colour rule and type

- The panel face takes the colour of the cycle's state: saffron when spending runs ahead of an even pace (now), green when on pace, vermilion when the cycle is over budget. Open the Empty state to see it turn green.
- Elsewhere colour is only a meaning: vermilion is over the line, green is money in, cobalt is shared with Anna. Everything else is ink on aluminium grey. Light and dark are each tuned (graphite ground, the same saffron face, brighter meaning colours).
- Type: Archivo, one family. Condensed width for the big readouts (like a gauge legend), normal width for text. Tabular figures in every column. No monospace.

## Why it is unmistakably about money and my month

The first thing on screen is 827 kr. left and 4 days to payday, on a scale that runs from 30 Oct to 30 Nov. The two meters put days and flexible kroner (everything but rent and bills, which land on day one) on the same scale, so "ahead of pace" is visible without reading and is not a false alarm. Shared, personal and moved money are named on every row and in a strip at the top of Transactions; top-ups to the shared account are shown as moved, never as spending.

## States and interaction

State switcher in the corner (Data, Loading, Empty, Error) on Cycle, Transactions, Budgets and Analytics. Add steps amount, category (recent first, with what is left in each), name (suggestions per category), saved; the saved card shows the new amount left, then returns where you were. Date, note, shared and income are chips one tap away.

## Least sure of

Whether the saffron face is too loud for many glances a day, and whether Home and Bills are the right fixed set for every owner.

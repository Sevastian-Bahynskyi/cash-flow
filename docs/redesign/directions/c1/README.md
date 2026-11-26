# c1: Two inks

**Idea.** Your month between paydays is something you hold. It is a deep indigo card with what's left, drawn from the days you've lived through, and the shared part is two people in two colours, you and Anna.

## References it builds on

- **Revolut, joint account (revolut-04) and payments as a chat (revolut-06).** Sharing should show two people, not a ratio. The pot with Anna has two overlapping circles. The Shared view lays out the top-ups as a conversation: Anna's on the left in saffron, yours on the right in indigo.
- **Revolut, huge balance (revolut-02) and Apple Card, Wallet (applecard-02).** The one number sits large on a solid, tactile object. Apple Card's weekly activity bars became the row of days: one bar per day of the cycle, with the days still to come drawn open.
- **YNAB, overspending card (ynab-05) and plan rows (ynab-03).** Over budget becomes a red object you can't miss: the Needs a look card on Home and the red category card. Budget rows carry the amount left in a pill.
- **Copilot, budget table (copilot-03).** On desktop the budgets become aligned columns: spent, budget, left.
- **Monarch, editorial serif (monarch-01).** Big numbers and the one-line answer on Where it went are set in a serif, with an italic for the human part ("4 days to payday").
- **Linear (linear-01).** Calm, dense lists, with a single column of marks at the left that tells whose money each row is.

## Colour rule

Two people, two colours. Indigo is you and saffron is Anna. Anything shared carries both, so two dots overlap. Red appears only where a budget line was crossed, and always with the word "over". Green appears only for money coming in, and always with a "+". Everything else is ink on a warm grey ground. Dark mode is tuned separately: an indigo-black ground, a lighter indigo for small marks, and the same rich cards.

## Type

Newsreader (serif) for the big numbers and the one-sentence answers. Hanken Grotesk for the interface, with tabular figures in every column. All amounts go through `Intl.NumberFormat('en-DK', DKK)`, which gives formats like "1.843 kr.".

## Why it is unmistakably about money and my month

- The first thing you see is the amount left, with "4 days to payday" written beside it in a human voice.
- Under it is the cycle itself: 31 days from 30 Oct, each sized by what you spent and coloured by whether it was yours or shared. A thin money line shows that the budgets (96% used) have run ahead of the days (87% gone).
- Money moved into the pot is labelled "Moved", shown in neutral ink and marked with an open ring. Home says it is not your spending until you spend it together. Where it went lists it as not counted.

## States and flow

- A small switcher in the top right corner (Content, Empty, Loading, Error) sits on Home, Transactions, Budgets and Where it went.
- Adding steps from Amount to Category to Name to Save. Date, Note, With Anna and Income are each one tap away.
- After you save, the sheet closes and you're back where you started, with an Undo toast. Today's bar grows on the card.

## Least sure of

- Whether indigo with saffron reads as rich and warm, or edges toward a bank.
- Whether the row of daily bars stays readable on a phone. The rent day is capped and marked with a break.
- Where it went leaves Home (rent) out of the bars, so the other categories stay readable. Leaving out the biggest category is a judgement call.

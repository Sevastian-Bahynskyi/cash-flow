# Redesign brief: five directions

The same brief goes to every designer. Read all of it before drawing anything.

## The app and the owner

Cashflow is the owner's personal budgeting app. It is a behavioural budgeting tool, not accounting. The owner opens it many times a day: at the till to log a coffee, at night to see how the month is going. They share some spending with their partner, Anna.

Product rules that every screen keeps (from `AGENTS.md`):

- **Fastest add path:** amount → category → name → save. The amount field is ready with the numeric keypad the moment the add screen opens. Date, note and "shared" stay off the happy path (one tap away).
- Category is mandatory for an expense. Income is a separate type.
- **Salary cycles, not calendar months.** The current cycle runs from the last salary (Fri 30 Oct) to the next one (Mon 30 Nov). It is called the November cycle. Today is Thu 26 Nov: 4 days to payday.
- **Shared fairness is inferred:** both top up a shared account; your share of shared spending is your top-ups divided by all top-ups (here 60%). Never a typed ratio.
- **AI only assists:** it may suggest a category or a name, and never blocks Save, never is the headline, never says "AI".

## The feel (the owner's words)

- Stricter and calmer than their other app. "A tool I open many times a day."
- It must still be **distinctive and premium, never a template**, never "it looks like good apps, but just as an app" (owner, about rejected directions of their other app).
- **Unmistakably about money and my month.** Someone who glances at the screen should know at once that it is about this month's money and how much is left until payday.

Read before designing, in this order:

1. `.agents/skills/ui-ux/taste.md`: the owner's taste and what they call AI slop. Every rule there is the owner's own word.
2. `.agents/skills/ui-ux/tells.md`: what makes a money screen look generated or careless.
3. `.agents/skills/ui-ux/copy.md`: money formatting, signs and colours, cycle wording, no hype.
4. `.agents/skills/ui-ux/dashboards.md`: one number per screen, one question per chart, four states.

Never borrow the look of the owner's other app (pink, a seahorse, hearts, liquid, hand-drawn doodles). Avoid the looks every AI produces right now: warm cream with a serif and a terracotta accent; near-black with one acid-green pop; purple-to-blue gradients; glassmorphism; Inter or Space Grotesk as the safe face; emoji; everything in rounded cards.

## References

`docs/redesign/references.json` lists 54 real screens from 12 apps (Copilot Money, Monarch, YNAB, Lunch Money, Revolut, Mercury, Apple Card and Wallet, Linear, Things 3, Splitwise, Rocket Money, Emma) with one line on why each works. The pictures are in the folder given in your task (`<app>-<nn>.webp`). Look at the pictures, not only the lines. Each direction names the three to five references it builds on and says what it takes from each. Take ideas, never copy a screen.

## The five screens

Fake data is in `docs/redesign/data/cashflow-fake.js` (`window.CASHFLOW_DATA`; amounts in integer øre; locale `en-DK`, currency DKK; format with `Intl.NumberFormat('en-DK', {style: 'currency', currency: 'DKK'})`). Compute everything from it; never type a total by hand.

1. **Home: the cycle.** The one number: what is left to spend this cycle (budgets total minus spent: about 827 kr) with 4 days to payday. The pace of spending against the cycle. What needs attention (Eating out is over, Shopping is slightly over). The shared account in one line. A clear way to add.
2. **Add a transaction.** The fastest path: amount (keypad) → category (recent first: Groceries, Eating out, Transport) → name (suggestions per category from the data) → Save. Show the path as steps the person can tap through, ending in the saved state returning to where they were. Off the path, one tap away: date (today by default), note, shared with Anna, income instead of expense.
3. **Transactions.** This cycle's list, grouped by day ("Today", "Yesterday", "Tue 24 Nov"), with the day's total. In and out told apart by sign and colour, never colour alone. Shared items marked. Search or filter available but quiet. Tapping a row may show its detail.
4. **A category / budget.** Eating out: 1,843 kr of 1,500 kr, over by 343 kr, its pace through the cycle, this cycle's transactions in it, last cycle for comparison (1,310 kr). Also a way to see all budgets at a glance (the list of nine categories with spent against budget).
5. **Analytics: one question.** "Where did my money go this cycle, and is it different from last cycle?" One clear answer with one chart, and the numbers readable without hover.

Every list and chart also gets its **empty, loading and error** states. Show them on the same screen through a small state switcher in your prototype's own corner (for the owner to see), not as separate pages.

## How it is built (the contract)

- One self-contained file per direction: `docs/redesign/directions/<id>/app.html`. Plain HTML, CSS and JavaScript. No build step, no framework. A library only if it does heavy work, from cdnjs pinned to an exact version; charts are your own inline SVG.
- Load the data with exactly this tag, which the choices page replaces with the inline data: `<script src="../../data/cashflow-fake.js"></script>`.
- Fonts from Google Fonts only, with a fallback stack. No other external file. No pictures except inline SVG you draw. One icon family, drawn by you.
- **Screens and navigation:** screen ids `home`, `add`, `transactions`, `budget`, `analytics`. The app moves between them like a real app (a tab bar, a back button, the add button). It reads `window.PROTO` at start: `{ screen: 'home', theme: 'light' | 'dark' }`, else `?screen=` and `?theme=` from the URL, else defaults. It listens for `message` events `{ type: 'go', screen }` and `{ type: 'theme', theme }`, and on every navigation posts `parent.postMessage({ type: 'at', screen }, '*')`.
- **Both themes,** designed, not inverted: `theme` sets `data-theme` on `<html>`; every colour is a CSS token on `:root` and redefined for dark.
- **Two widths:** the same file works at 390 × 844 (iPhone) and 1280 × 800 (desktop) and everything between. Desktop is a real desktop layout of the same app (more on one screen, not a stretched phone and not an admin template).
- Phone safe areas: keep content clear of the top 47 px and bottom 34 px on phone width.
- Accessible: real buttons, names on icon buttons, visible focus, contrast AA in both themes, amounts with `tabular-nums` in columns.
- Fake data only. Nothing private, nothing real.

## What each designer hands back

For each direction:

- `docs/redesign/directions/<id>/app.html`;
- `docs/redesign/directions/<id>/README.md`: a two-word name; the idea in one sentence; the references it builds on and what it takes from each; the colour rule (how the palette was picked) and type; what makes it unmistakably about money and *my month*; what you are least sure of.
- Screenshots you took with `docs/redesign/tools/shoot.sh <id> [out-dir]` and looked at, fixed until nothing clips, overlaps or reads as generic.

Do not commit, do not edit other files, do not open the owner's browser, do not start other agents.

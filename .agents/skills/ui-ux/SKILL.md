---
name: ui-ux
description: Cashflow's design skill for native screens, interactions, colour, icon systems, prototypes, money copy, dashboards, polish, and UI or UX reviews.
---

# Cashflow UI / UX

Cashflow is a behavioural budgeting app. A quick visit should answer how this salary cycle is going, what changed, or what a charge belongs to.

## Source of truth

- The owner's brief, approved interaction and [Aura brand](brand.md) set direction. Read [taste](taste.md) § 7–8 before proposing a look or icon system. Show complete, tappable comparisons with fictional data and build the owner's choice.
- [Copy](copy.md) governs the display of money and dates. [Dashboards](dashboards.md) governs charts and breakdowns. [Tells](tells.md) helps spot visual and interaction problems. [Exemptions](exemptions.md) are historical decisions where marked.
- Compose from `src/ui/kit` and use its [tokens](../../../src/ui/kit/theme.ts). Reserve the living Aura for money summaries. Use shared selection feedback for discrete controls and respect Reduce Motion. Keep input ready while animations run.

## Design a flow

1. Identify the one question the screen answers and the next action it makes easy. Use salary cycles and actual dates.
2. Sketch the useful states with fixtures: current and past cycle, empty, loading, error and offline as applicable. Where a number summarizes spending, keep its transaction drill-down in the same period.
3. Match Settings' parent–child hierarchy on Budgets. Keep the cap on the parent and show each child's contribution. Give the parent a stable accent across budgets, charts and transactions. Show status in words too.
4. Use system Back, safe areas, labelled controls, text that scales and touch targets of at least 44 points. Offer tap controls alongside horizontal paging.

## Verify on iPhone

Run the [native device pass](../../../docs/agents/ios-verification.md) for every meaningful visible or interaction change. Compare the running app with the approved reference. Exercise the main path, an edge state and re-entry. Report the checked device and scenarios with a screenshot or snapshot. Add a fixture when getting into an important state would otherwise require sign-in, waiting or bank data.

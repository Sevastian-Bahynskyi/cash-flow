# Context

## Product Definition

This app is a behavioral awareness tool, not an accounting system.

Its purpose is to:
- minimize friction when logging transactions
- enforce strong categorization
- expose spending patterns without overwhelming the user

Primary priorities:
- speed over completeness
- clarity over flexibility
- predictability over automation

The system must optimize for fast input and a consistent mental model, not feature richness.

## Core Source of Truth

Transactions are the only source of truth.

The following must always be derived from transactions:
- balances
- salary cycles
- shared ratios
- analytics
- dashboards

Do not introduce duplicated balances, manual counters, or hidden state that can drift from transaction data.

## Transactions

### Intent
- Transactions must be loggable in under 15 seconds so users never avoid using the app.

### Required fields
- `name`
- `amount`
- `date`
- `category_id`

### Optional fields
- `comment`
- `country` as ISO code, auto-detected when possible
- `is_recurring`
- `is_shared`
- `shared_participant` as `me | gf`

### Rules
- `amount` is always positive.
- Income is a separate transaction type. Never represent income as a negative expense.
- Category is required before save.
- Editing a transaction overwrites the current row. No edit history in v1.
- A transaction must be savable from one screen.

### UX constraints
- Happy path order is: amount -> category -> name -> save.
- Category selection may open a bottom sheet.
- No required secondary screens or confirmation steps.

## Categories

### Intent
- Categories are the main behavioral lens for the entire app.

### Structure
- Exactly two levels: category -> subcategory.

### Rules
- A subcategory cannot exist without a parent category.
- No nesting deeper than two levels.
- Categories are global across the app.
- Default categories exist and cannot be deleted.
- Users can create categories and subcategories.
- Users can edit category color and icon.
- Subcategories inherit color from the parent and cannot override it.

### UX rules
- Categories are sorted by usage frequency.
- Search is always available.
- The picker is shown in a bottom sheet with visible parent/child structure.

## Currency

### Intent
- Let users log in any currency while keeping analytics consistent.

### Rules
- Users may input any supported currency.
- The system converts the value to DKK using the rate for that day.
- The converted DKK value is stored at creation time and never recalculated later.
- Historical transactions remain fixed even if exchange rates change.

## Balances

### Intent
- Balances provide orientation, not strict accounting.

### Balance types
- `personal_balance`
- `shared_balance`

### Rules
- Balances are fully derived from transactions.
- No manual balance edits are allowed.

### Personal balance includes
- income
- expenses
- savings movements
- loan events
- shared contributions

### Shared balance includes
- shared top-ups
- shared expenses as proportional deductions

## Shared Account

### Intent
- Shared logic should feel fair without requiring partner bookkeeping.

### Transaction UX
- Transactions have a `shared account` toggle.
- When enabled, show participant chips: `Me` and `GF`.

### Contributions
- Shared contributions are tracked through shared account top-up transactions.

### Ratio calculation
- Recalculate after every top-up.
- Use only the current salary cycle.
- Never allow manual ratio input.

### Spending rules
- Shared expenses reduce `shared_balance`.
- The user pays a proportional share based on the current ratio.
- GF spending is not entered directly.
- GF share is inferred from total shared expenses and the user contribution pattern.

### Output screen
- Dedicated screen: `Shared Expenses`

This screen shows:
- total contributed
- total spent
- user share
- GF inferred share
- transaction history

### Separation rule
- Shared data must not pollute the personal dashboard.

## Salary Cycles

### Intent
- The app must reflect real salary-based budgeting behavior, not calendar-month accounting.

### Rules
- A cycle starts when a salary transaction is created.
- A salary created on days `26` to `31` counts toward the next month.
- If no new salary is logged, the previous cycle continues.
- All analytics use salary cycles.
- Never fallback to calendar months.

## Budgets And Alerts

### Intent
- Budgets should raise awareness, not restrict behavior.

### Rules
- Budgets exist per category and subcategory.
- No rollover behavior in v1.

### Thresholds
- `80%` -> warning with yellow state
- `100%+` -> critical with red state

### Notifications
- Show alerts in-app.
- Send weekly summary push only.
- Never block transaction creation.

## Savings

### Intent
- Savings must feel explicit and intentional.

### Behavior
- Multiple savings entries are allowed.
- Each savings entry supports:
  - add
  - subtract
  - set

### UX
- Savings are shown as progress bars.
- Long press opens edit actions.

### Rule
- Savings reduce personal balance.

## Loans

### Intent
- Loans should be tracked simply, without financial modeling.

### Behavior
- Multiple loans are allowed.
- Store remaining amount only.
- Do not model interest.

### Repayment
- Repayments are handled through transactions and category-based logic.

## Bank Screen

### Intent
- The Bank screen is the central place for financial state outside day-to-day transaction logging.

### Contains
- savings
- loans

### UX
- Items are displayed as progress bars.
- Long press opens edit options.
- New savings and loan items are created only from this screen.

## AI Categorization

### Intent
- AI should reduce repetitive categorization work without becoming intrusive.

### Trigger
- Run when transaction input loses focus.

### Inputs
- `name`
- `comment`
- past transactions

### Rules
- AI must not block saving.
- If the user overrides a suggestion, stop auto-categorizing that pattern.
- Learning is simple pattern mapping, not a complex adaptive system.

## UX System

### Intent
- The app should feel speed-first at all times.

### Global rules
- Global `+` button is always accessible.
- Transaction input uses a full-screen modal.
- Initial transaction form stays minimal.
- Category picker uses a bottom sheet with drag gesture.
- Search sits at the top of the category picker.
- Use a custom numeric keyboard with light gray styling and a thin neon outline.

### Animation rules
- Animations should be smooth but subtle.
- Animations must never delay input or saving.

## Dashboards

### Personal dashboard
- personal spending
- income
- category breakdown

### Shared dashboard
- same structure as personal dashboard
- based only on shared data

### Rule
- Personal and shared data must remain clearly separated.

## Technical Constraints
- No offline support. Internet is required.
- Small scale only, up to five users.
- Prioritize simplicity over scalability.

## Implementation Guardrails
- Prefer direct, explicit logic over abstractions.
- Avoid hidden automation that changes the user’s mental model.
- Preserve one-screen transaction entry as the default behavior.
- If a feature increases friction or ambiguity, reject it unless it clearly improves the core behavioral goals.

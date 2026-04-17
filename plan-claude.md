# plan-claude

## Status Snapshot

- Icon migration is complete: MaterialCommunityIcons -> FontAwesome6 across app screens/components.
- No further icon-library migration work is needed in this plan.
- Current focus is deduplication and extraction, with no Supabase schema/query changes.

## Goals

- Remove duplicated helper logic across screens.
- Extract repeated UI leaf patterns into small reusable components.
- Keep behavior and visuals stable (no product-flow changes).
- Keep implementation simple and deterministic.

## Constraints

- Functional components + hooks only.
- TypeScript strict; no any.
- No changes to Supabase schema/RLS/migrations for this plan.
- Do not touch debug-only regions unless required by compile/runtime breakage.

## Execution Order

### Phase A - Helper Extraction (highest priority)

1. Extract date/cycle helpers into shared lib:
   - toLocalIsoDay
   - formatHeroCycleRange
   - cycleMatch
2. Extract numeric parser helper into shared formatter lib:
   - parseMinor
3. Replace local duplicate implementations with imports.

Expected target files:

- src/lib/cycles.ts (add exports)
- src/lib/format.ts (add export)
- src/features/home/HomeScreen.tsx
- src/features/shared/SharedScreen.tsx
- src/features/budgets/BudgetScreen.tsx
- src/features/bank/BankScreen.tsx
- src/features/dashboard/useDashboard.ts

### Phase B - Shared UI Leaf Components

1. Create ErrorCard primitive for repeated inline error blocks.
2. Create SelectionIndicator primitive for repeated selected/unselected visuals.
3. Create SearchField primitive for repeated search input shells.
4. Create SharedParticipantChip primitive for repeated GF/Me visual chips.
5. Replace call-sites incrementally with minimal styling deltas.

Expected target files:

- src/ui/ErrorCard.tsx
- src/ui/SelectionIndicator.tsx
- src/ui/SearchField.tsx
- src/ui/SharedParticipantChip.tsx
- calling screens/components with duplicated UI blocks

### Phase C - Hero Carousel Arrow Control Extraction

1. Create HeroPagerArrows component from repeated arrow/pressable logic.
2. Keep icon family consistent with current app (FontAwesome6 chevrons).
3. Keep haptics and scroll behavior unchanged.

Expected target files:

- src/ui/HeroPagerArrows.tsx
- src/features/shared/SharedScreen.tsx (replace inline arrows)

### Phase D - Motion Refresh Hook Extraction

1. Create useMotionRefresh hook for repeated focus-refresh animation bump pattern.
2. Replace local motionRun + useFocusEffect duplicates where identical.

Expected target files:

- src/features/shared/hooks/useMotionRefresh.ts (or closest existing feature hook location)
- screens currently duplicating this pattern

### Phase E - Verification + Cleanup (final pass)

1. Run lint/typecheck and verify no new errors introduced.
2. Manual parity checks on Home/Shared/Budgets/Bank/Dashboard flows.
3. Ensure all icon names remain FontAwesome6-valid after refactors.
4. Remove only dead local helpers made redundant by extraction.

## Risks and Mitigations

- Risk: Extracted helpers subtly change boundary behavior.
  - Mitigation: Preserve exact function logic first; refactor internals only after parity pass.
- Risk: UI primitive extraction changes spacing/typography.
  - Mitigation: Move styles as-is initially; do not redesign during extraction.
- Risk: Hero arrow extraction breaks pager/haptics sequence.
  - Mitigation: Keep callback signatures and call order unchanged.

## Definition of Done

- Duplicate helper implementations replaced with shared imports.
- New UI leaf components used in duplicated call-sites.
- Shared hero arrow logic extracted and behaviorally identical.
- Motion refresh pattern extracted where repeated.
- No new lint/type errors attributable to this work.
- Shared transaction flow remains: amount -> category -> name -> save.

# React Native / Expo Skill — Cash Flow

## Stack
- Expo managed workflow
- React Native with TypeScript strict mode
- Functional components and hooks only
- Minimal global state
- Modal-first UX for transaction entry

## Project Priorities
1. Transaction entry must feel fast enough for daily use.
2. Category selection must be mandatory but friction-light.
3. UI should surface awareness, not complexity.
4. Shared spending details should stay understandable without cluttering the main flow.

## Non-Negotiable Rules
1. Do not use `any`, `@ts-ignore`, or unsafe casts without a clear reason.
2. Keep state local unless two or more distant screens truly need shared state.
3. Prefer direct screen logic over custom hooks or abstractions unless duplication is real.
4. Use controlled inputs for transaction fields.
5. Always handle loading, empty, and error states for user-visible fetches.
6. Use async/await only.
7. Keep navigation and component APIs explicitly typed.

## UX Rules
- The add transaction flow must prioritize amount, then category, then name.
- Use a full-screen modal for transaction input.
- Use a searchable bottom sheet or equivalent lightweight picker for categories.
- Keep the first transaction screen minimal; secondary fields stay out of the happy path.
- Numeric input should open the numeric keyboard immediately.
- Animations should be subtle and never delay input readiness.

## Component Conventions
- Props interface above the component.
- Default exports for screens, named exports for reusable UI pieces.
- PascalCase for components and screens.
- camelCase for hooks and utilities.
- Prefer short files with clear intent over generic shared primitives.

## Styling Conventions
- Centralize colors, spacing, radius, and typography in a small token file.
- Avoid hardcoded design values in multiple places.
- Do not build a heavy design system for v1.
- Favor consistency and readability over clever styling patterns.

## Performance Guidance
- Optimize only where the UX needs it.
- Use memoization sparingly and only when there is a measurable render issue.
- Use stable keys for lists.
- Avoid expensive work on every keystroke in the transaction form.
- Category search should feel instant from prefetched in-memory data.

## Package Guidance
- Prefer Expo-native or Expo-compatible libraries.
- Avoid adding state, navigation, form, or animation libraries unless the built-in or existing approach is clearly insufficient.
- Flag any dependency that pushes the app out of managed workflow.

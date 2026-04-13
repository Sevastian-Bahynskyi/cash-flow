---
name: react-native
description: React Native and Expo implementation guidance for this repo's speed-first transaction UX, strict TypeScript, and conservative architecture rules.
---

# React Native Skill (Cash Flow)

Use this skill for app-side React Native work in this repository.

## Core Intent

- Keep the add-transaction flow fast and predictable.
- Preserve strict TypeScript and direct feature-level implementation.
- Prefer simple, local state and explicit UI behavior.

## Rules

- Functional components and hooks only.
- No `any`, no unsafe casts, no silent errors.
- Use controlled inputs for transaction fields.
- Keep the happy path: `amount -> category -> name -> save`.
- Use async/await only.
- Keep source structure flat and easy to scan.

## UX Guardrails

- Do not add steps that slow transaction entry.
- Category remains required for expenses.
- Keep category picking searchable and quick.
- Use subtle animations only; never delay interaction readiness.

## Architecture Guardrails

- Prefer direct implementation over speculative abstractions.
- Add custom hooks only when duplication or mixed responsibilities are real.
- Avoid introducing extra infra layers for app logic.
- Keep error/loading/empty states explicit on user-facing data flows.

## Related References

- `CLAUDE.md`
- `codex.md`
- `.claude/skills/react-native.md`

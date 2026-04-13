# Agent Orchestration Policy

This repository uses a conservative, explicit orchestration policy for all AI coding agents.

## Scope
- Applies to Claude, Codex, and Cursor agents.
- Applies to built-in tools, local skills, and external plugins.

## Default Behavior
- Do not auto-load newly added skills or plugins.
- Do not switch to specialized skills/plugins just because they exist.
- Keep execution in the default agent flow unless there is explicit user intent.

## Skills and Plugins
- Treat all skills as opt-in, not automatic.
- Treat all plugins as opt-in, not automatic.
- This includes `caveman`, `lean-ctx`, `symdex`, and repo-local skills such as `react-native`.
- Use these only when the user explicitly asks for them by name, or clearly requests the exact capability.

## When Explicit Use Is Allowed
- The user asks to use a specific skill/plugin.
- The user asks for behavior that directly requires that skill/plugin capability.
- If the request is ambiguous, ask before enabling any optional skill/plugin.

## Guardrails
- Prefer direct, local tools and code edits first.
- Keep changes minimal and deterministic.
- Do not introduce orchestration complexity unless it is requested.

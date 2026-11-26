---
name: ui-ux
description: Cashflow's one design skill. Use for any UI work: designing, building or changing a screen, flow, component or interaction; a new look, direction, icon or app icon; prototypes and choices shown to the owner; charts, dashboards, analytics and reports; money formatting and copy; UI polish; "looks AI-generated" or "sloppy" complaints; UX review or audit.
---

# Cashflow UI / UX

Design like a senior product designer for a money tool, then build like a senior web engineer. Every rule here is meant to be checked and cited, not admired.

Cashflow is a behavioural budgeting app the owner opens many times a day: calm, strict, fast, and still distinctive and premium. It must read at once as being about money and *my month*, never as "a good app, just as an app" (`taste.md` § 2).

## Precedence

When two sources disagree, the higher one wins:

1. **The owner's brief** for the task, the approved prototype (once it exists), [`brand.md`](brand.md), and owner decisions in [`exemptions.md`](exemptions.md).
2. **Product rules** in `AGENTS.md` (fastest add path, salary cycles, shared fairness, AI only assists).
3. **Accessibility floors:** WCAG AA contrast, 44px targets, text that zooms to 200% without loss, labelled controls, keyboard reachable, safe areas, a working browser Back.
4. **[`taste.md`](taste.md)** (the owner's anti-slop taste and design process), **[`tells.md`](tells.md)**, **[`copy.md`](copy.md)**, **[`dashboards.md`](dashboards.md)**.
5. **Other design skills** (`frontend-design`, `dataviz`, Vercel's web guidelines) help explore and build. They never override anything above.

## Route the task

| Task | Read |
|---|---|
| Build or change a screen, flow or component | this file, `brand.md`, `taste.md` § 2-3, `tells.md`, `copy.md` |
| Anything showing an amount, date, cycle or currency | `copy.md` § Money first |
| A chart, a dashboard, analytics, a report, a stat | `dashboards.md`; the `dataviz` skill when the host has it |
| A new look: direction, icon set, app icon, onboarding | `taste.md` § 7 and § 8: references, variants on the [choices page](choices-page/README.md), the owner picks, then build |
| Show the owner a design, plan or choice | `taste.md` § 8 and the choices page |
| Polish, "looks AI-generated" | `taste.md` § 1-3, `tells.md` § Polish pass |
| Building the PWA shell (manifest, service worker, icons) | the `web-pwa` skill |

## Design sequence

Before coding, write down:

1. the moment: where the owner is and what they want (often: standing at a till, phone in one hand, 3 seconds);
2. the one number that matters on this screen, and the one primary action;
3. the information hierarchy and the interaction model;
4. every state: loading, empty, error, offline, a new cycle with no data, a huge month;
5. accessibility: labels, targets, zoom, keyboard, contrast in both themes;
6. the smallest composition of existing components that expresses it.

Then build and look at the result rendered, at phone width and desktop width, light and dark. Iterate from what you see, not from the code.

## The design

- **The look is [`brand.md`](brand.md).** Until the owner picks a direction it is empty: never invent a look to fill it.
- **How a look is reached:** [`taste.md`](taste.md) § 7. References first, then clickable directions, then the owner's pick, then a full prototype, then code.
- **Once approved, the prototype is the specification.** Build it one to one and lose no existing feature.

## Implementation truth

- **Today:** the Expo app (`app/`, `src/`); tokens live in `src/ui/tokens.ts`. It stays untouched until the owner approves the switch (ADR 0001).
- **Next:** a Next.js web app installed as a PWA, the Ordly way (`docs/adr/0001-web-first-pwa.md`, `web-pwa` skill). Its token file becomes the one visual source of truth; no hex or hand-typed sizes outside it.
- **No UI kit to look designed:** no shadcn defaults, Material, Bootstrap or a template dashboard. A component library may provide behaviour (a dialog, a sheet), never the look.
- Money is integer minor units end to end; format only at the edge (`copy.md`).
- Interaction never waits for decoration. The add path is ready to type on first frame.

## Visual acceptance

For any meaningful visual change, render it and keep the evidence:

- [ ] one number that matters and one primary action, readable at a glance; the Template test in `tells.md` passes;
- [ ] no tell from `tells.md` added;
- [ ] 390px (iPhone) and 1280px (desktop), light and dark;
- [ ] browser zoom 200% and iOS large text: nothing clips or hides a control;
- [ ] keyboard open on every input (iPhone Safari): field and submit stay visible;
- [ ] loading, empty, error and offline states for every list and chart;
- [ ] amounts: sign plus colour, tabular in columns, right-aligned, currency correct (`copy.md`);
- [ ] targets ≥44px; every control has a name; keyboard focus is visible;
- [ ] safe areas in the installed PWA (notch, home indicator);
- [ ] re-entry: leave and come back; nothing replays an entrance or flashes empty.

## Tooling

- Screenshots: headless Chrome (`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=out.png --window-size=390,844 <url>`). Never open a local preview in the owner's Chrome, and never leave one open.
- Pages for the owner: the Artifact tool, published, private by default. Fake data only: anyone with the link can read it.

---

Credits: structure and `taste.md` from CoupleGoAI's `mobile-ui-ux` skill; tells adapted from Expo `native-slop.md` (MIT), Draftbit `mobile-taste-skill` (MIT) and unslop by Damir Sokolovsky (CC BY 4.0).

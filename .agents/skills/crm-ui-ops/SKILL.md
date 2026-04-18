---
name: crm-ui-ops
description: Use when building or refining operational UI for this CRM, especially Dashboard, Bandeja, Pipeline, daily inbox, reporting cards, or any operator-facing screen in frontend/src/AppShell.jsx. Applies the project's existing executive, low-noise visual language and preserves AppShell as the real active frontend.
---

# CRM UI Ops

Use this skill for operator-facing UI in the active CRM frontend.

## Context

This app is:

- personal-use first
- potentially commercial later
- professional, detailed, reliable
- clear, executive, operational
- intentionally not a generic AI dashboard

The UI should optimize for:

- fast scanning
- immediate next action
- low cognitive load
- consistent dense layouts for repetitive work

## Active frontend scope

- Real screen: `frontend/src/AppShell.jsx`
- Real styles: `frontend/src/styles.css`
- Ignore `frontend/src/App.jsx` for product changes

## Existing UI patterns worth reusing

- `hero-panel` for top summaries
- `mini-kpis` for compact operational counts
- `worktray` for queue execution
- `pipeline` for state-based reading
- `today-inbox` and comparison cards for dashboard summaries
- `provider-pill`, `status-badge`, `filter-chip` for compact semantic markers

## Workflow

1. Start from the operator task, not from a decorative layout.
2. Reuse existing visual primitives before inventing new ones.
3. Keep controls close to the data they act on.
4. Prefer one-screen flows over modal detours.
5. Preserve the current light, executive, low-noise direction stored in `.impeccable.md`.

## Do

- make the next step obvious
- show counts and labels that help triage work
- favor compact cards, strips, and lists with real hierarchy
- keep CTA copy short and operational
- maintain responsive behavior for desktop and narrow widths

## Do not

- introduce a second visual language unrelated to current AppShell patterns
- add decorative dashboard chrome that does not improve scanning
- create parallel mock screens outside `AppShell.jsx`
- overuse bright accents for non-critical information

## Validation

1. `npm run build` in `frontend`
2. Check the touched view in desktop and mobile breakpoints
3. Confirm the change still feels like the same product, not a bolted-on admin template


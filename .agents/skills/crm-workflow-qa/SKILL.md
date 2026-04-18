---
name: crm-workflow-qa
description: Use when changing or validating the operational workflow of this CRM: Enviar, Seguir, Portal, Descartar, history, follow_up_date behavior, worktray actions, pipeline transitions, or reporting that depends on workflow state. Focuses on regression-safe checks across backend/server.py, backend/app/db.py, and frontend/src/AppShell.jsx.
---

# CRM Workflow QA

Use this skill when touching workflow behavior or when you need a structured regression pass over operational flows.

## Core workflow contract

- `Enviar`
  - opens draft through `mailto`
  - updates contact to `status=seguimiento`
  - sets `next_action=seguir`
  - sets `follow_up_date` to 3 days
- `Seguir`
  - opens follow-up draft through `mailto`
  - keeps `status=seguimiento`
  - keeps `next_action=seguir`
  - sets `follow_up_date` to 7 days
- `Portal`
  - exits active queue
  - stores `portal_url` and `portal_status`
- `Descartar`
  - exits active queue
  - stores `discard_reason`
- Contact history is available at `GET /contacts/:id/history`

## Files to inspect first

- `backend/server.py`
- `backend/app/db.py`
- `frontend/src/AppShell.jsx`
- `frontend/src/styles.css` only if the workflow change alters controls or visibility

## QA checklist

1. Verify state transition:
   - `status`
   - `next_action`
   - `follow_up_date`
   - structured fields such as `portal_status` or `discard_reason`
2. Verify side effects:
   - draft payload for `enviar` and `seguir`
   - history row insertion
   - reporting counts if the workflow feeds reporting
3. Verify UI reachability:
   - worktray
   - pipeline
   - dashboard inbox if the item should appear there
4. Verify that a completed action leaves the contact in the expected queue or outside it.
5. Verify manual follow-up rescheduling still works.

## Common regressions to watch

- action buttons still visible after a contact should have left the queue
- `follow_up_date` not updating when `Enviar` or `Seguir` runs
- `Portal` and `Descartar` storing note text but not structured fields
- history showing stale or missing events
- reporting counts drifting from actual workflow state
- pipeline/dashboard views using outdated assumptions about active actions

## Validation

Minimum:

1. `npm run build` in `frontend`
2. `python -m py_compile backend/server.py`

Preferred when workflow behavior changed:

1. Start real backend locally
2. Hit affected endpoints
3. Confirm the contact row and reporting output reflect the intended transition


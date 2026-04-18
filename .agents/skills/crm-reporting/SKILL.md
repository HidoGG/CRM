---
name: crm-reporting
description: Use when adding or changing operational reporting in this CRM, including dashboard KPIs, worktray metrics, pipeline summaries, weekly comparisons, daily snapshots, or anything that reads from contacts/history/reporting_overview. Applies to backend reporting logic in backend/server.py and reporting UI in frontend/src/AppShell.jsx.
---

# CRM Reporting

Use this skill when the task touches metrics, summaries, reporting cards, period comparisons, inbox views, pipeline counts, or snapshot-backed operational reporting.

## Project anchors

- Backend entrypoint: `backend/server.py`
- Database bootstrap: `backend/app/db.py`
- Active frontend shell: `frontend/src/AppShell.jsx`
- Active styles: `frontend/src/styles.css`
- Real database: `%LOCALAPPDATA%/CRMIA/crm.sqlite3`

## Reporting surfaces already in use

- `GET /summary` for basic totals
- `GET /reporting/overview` for operational reporting
- Dashboard cards, `Inbox de hoy`, weekly comparison, stock vs snapshot
- Pipeline status view, weekly follow-up agenda, worktray reporting strip

## Current data model expectations

Reporting should derive from existing workflow fields on `contacts`:

- `status`
- `next_action`
- `follow_up_date`
- `portal_status`
- `discard_reason`

Activity reporting should derive from `history`, especially:

- `contact.action_executed`

Daily stock comparison should remain compatible with:

- `reporting_snapshots.snapshot_date`
- `reporting_snapshots.total_contacts`
- `reporting_snapshots.active_total`
- `reporting_snapshots.overdue_count`
- `reporting_snapshots.due_today_count`
- `reporting_snapshots.due_this_week_count`
- `reporting_snapshots.without_date_count`

## Workflow

1. Confirm whether the request is about stock, activity, or both.
2. Prefer extending `build_reporting_overview()` instead of adding parallel endpoints unless the shape is truly different.
3. Keep metric definitions consistent with current workflow conventions:
   - `Enviar` moves to `seguimiento`, `next_action=seguir`, `follow_up_date=+3 days`
   - `Seguir` keeps `next_action=seguir`, `follow_up_date=+7 days`
   - `Portal` exits active queue and stores portal fields
   - `Descartar` exits active queue and stores discard reason
4. If the frontend needs a new metric, first expose it from backend reporting, then consume it in `AppShell.jsx`.
5. Reuse existing comparison card styles and helper patterns before adding new UI variants.

## Guardrails

- Do not build reporting from `frontend/src/App.jsx`; it is not the active app.
- Do not create duplicate sources of truth for the same metric in multiple endpoints.
- Prefer deterministic aggregations from SQLite-backed data over client-only approximations.
- Keep labels operator-friendly and short.
- For date windows, be explicit whether the metric is `today`, `this week`, `last 7d`, or `previous 7d`.

## Validation

After changes:

1. Run `npm run build` in `frontend`.
2. Run `python -m py_compile backend/server.py`.
3. Verify `GET /reporting/overview` against the real backend when the change affects reporting payloads or persistence.


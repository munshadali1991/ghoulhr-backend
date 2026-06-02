# Calendar platform — Phase 2 epic (not implemented)

This document captures the planned expansion beyond the org holiday MVP. Items here are **out of scope** for the Phase 0/1 audit remediation.

## Target capabilities

| Area | Direction |
|------|-----------|
| `calendar_events` | Non-holiday company events (all-hands, closures) with optional location scope |
| Recurrence | RRULE or yearly templates + materialization job for ESS/leave ranges |
| Audit log | Actor, action, before/after for holiday CRUD (pair with RBAC when roles ship) |
| Bulk import | CSV/ICS regional packs into draft calendars before publish |
| External sync | Adapters for Google/Outlook; read-only export first |

## Suggested schema sketch

- `calendar_events(id, organizationId, calendarId?, title, startDate, endDate, eventType, locationId?, metadata jsonb)`
- `calendar_audit_logs(id, organizationId, entityType, entityId, action, actorId, payload jsonb, createdAt)`

## API boundaries

- Admin: `/settings/organization/calendar` — holidays + events + publish (draft → published)
- ESS: read-only published materialized rows in date range
- Leave engine: consumes published holiday date set + org timezone day boundaries

## Dependencies

- Org timezone wired into day-boundary logic (Phase 1)
- Explicit publish workflow (Phase 0)
- Role-based route protection (future RBAC phase)

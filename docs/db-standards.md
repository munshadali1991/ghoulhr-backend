# Database Standards (Tenant DB)

## Schema Boundaries

- `core`: employee identity/auth/session tables.
- `master`: controlled reference data and master mappings.
- `feature`: domain-specific detail/transaction tables.
- `audit`: append-only audit and security trails.
- `config`: setting catalog, tenant values, and helper views.

## Naming Rules

- Table names are snake_case plural nouns (example: `departments`, `employee_documents`).
- Mapping tables use `<left>_<right>` (example: `designation_departments`).
- FKs are `<referencedEntity>Id` in camelCase for TypeORM entities.
- Primary key is always `id` UUID unless table is a pure mapping table.

## Migration Rules

- Every migration must include:
  - PK/FK/UNIQUE/INDEX definitions for new tables.
  - rollback path in `down()`.
  - `COMMENT ON TABLE` / `COMMENT ON COLUMN` for non-obvious structures.
- All tenant migration DDL must be schema-qualified (`core.<table>`, `master.<table>`, etc.) to prevent accidental creation in `public`.
- No ad-hoc schema drift through manual DB edits.

## PR Checklist (DB changes)

- [ ] Schema placement is correct (`core`, `master`, `feature`, `audit`, `config`).
- [ ] Naming conventions are followed.
- [ ] FK and hot-query indexes are added.
- [ ] Sensitive fields are encrypted or masked where required.
- [ ] Data dictionary is updated in `docs/tenant-data-dictionary.md`.
- [ ] Rollback and smoke-check notes are included.

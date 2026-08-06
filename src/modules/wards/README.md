# Wards module

Owns CRUD for `inpatient.wards` (db.sql).

## Persistence

`PrismaWardRepository` — paginated list/search, soft-delete via `is_active=false`.

## Prefer IPD journey for occupancy

Creating beds/admitting patients: use `/ipd/*` (`IpdJourneyUseCase`) so bed occupancy stays transactional.

## Tests

```bash
yarn jest src/modules/wards --coverage=false
```

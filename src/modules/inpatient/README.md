# Inpatient / IPD module

Owns the inpatient journey against `db.sql` schema `inpatient.*`.

## Important schema fact

**There is no `rooms` table.** Beds hang directly off wards:

`wards` → `beds` → `admissions` → `bed_transfers` / `discharge_summaries`

## Use cases

| Use case | Persistence |
|---|---|
| `IpdJourneyUseCase.createWard` | `inpatient.wards` |
| `IpdJourneyUseCase.createBed` | `inpatient.beds` (AVAILABLE) |
| `IpdJourneyUseCase.admit` | transaction: occupy bed + create ADMITTED admission |
| `IpdJourneyUseCase.transfer` | transaction: bed_transfers history + free/occupy beds |
| `IpdJourneyUseCase.discharge` | transaction: DISCHARGED + free bed + discharge_summaries |

## HTTP (`/ipd`)

- `POST /ipd/wards`
- `POST /ipd/beds`
- `POST /ipd/admissions`
- `POST /ipd/admissions/:id/transfer`
- `POST /ipd/admissions/:id/discharge`
- `GET /ipd/admissions/:id/transfers`

## Events → realtime

Domain events (`ipd.patient.*`) are bridged by `AdmissionRealtimeListener` to `RealtimeService.publishToRoom('ipd', …)` (Socket.IO when enabled).

## Ops facade

`OpsService.createAdmission` selects an available bed then **delegates** to `IpdJourneyUseCase.admit` (no duplicate bed rules in ops).

## Tests

```bash
yarn jest src/modules/inpatient/__tests__/ipd-journey.usecase.spec.ts
```

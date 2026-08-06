# Architectural Workflow Report — NyaLife Backend

Generated: 2026-08-04 (billing/ops/catalog thinning wave)

## Completed this wave

### Billing repository completion
| Concern | Status |
|---------|--------|
| **settleVisit** | Moved into `PrismaBillingRepository` — invoices, payments, allocations, claims |
| **syncClaimStatus** | Repository method; settlement service is a thin orchestrator |
| **M-Pesa checkout** | `mpesaTransactions`, receipts, visit load/update behind `IBillingRepository` |
| **CheckoutService** | Orchestrates MpesaClient + pharmacy dispense only; no direct Prisma |

### Ops thinning
- `createAppointment` / `markAppointmentArrived` → `AppointmentsService`
- `createRadiologyRequest` → `RadiologyService` (scan-type check + request-number still local)
- Patients create + IPD admit remain facades; meds/staff/bootstrap still ops Prisma (bootstrap helpers)

### Catalog caps
Unbounded `findMany` now capped (`take` 100–500): doctors, departments/staff, medications (+ batch sub-take), lab tests, staff, insurers, wards, dashboard age-sample patients. Existing list endpoints already had takes where needed.

### Prior (preserved)
- Legacy modules → repository ports (visits, insurance, auth)
- Scaffold stubs → real Prisma across clinical modules
- Journeys: `/ipd`, pharmacy FEFO, `/laboratory`
- Offline e2e harness (`DATABASE_OPTIONAL` unless `E2E_USE_LIVE_DB=true`)

## Test / build
| Check | Result |
|-------|--------|
| `yarn build:app` | Pass |
| `yarn test:e2e` (offline) | **20/20** |
| Live IPD (`E2E_USE_LIVE_DB=true` + network) | Pass when DB reachable; soft-pass if flag set but DB down |

## Remaining (thin)
1. **Ops** meds/staff/invoice/bootstrap still use Prisma directly (could move to medications/staff/billing later).
2. TypeORM adapters remain shims (Prisma is production ORM).
3. Bull processors unregistered while Redis optional.
4. `communication` deferred (`.gitkeep`).

## Commands
```bash
cd backend
yarn build:app
yarn test:e2e
E2E_USE_LIVE_DB=true yarn test:e2e --testPathPatterns=ipd-journey.live
```

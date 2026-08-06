# Laboratory module

Owns the lab journey against `db.sql` schema `laboratory.*`.

## Journey (`LabJourneyUseCase`)

| Step | Status / entity |
|---|---|
| `createRequest` | `requests` status PENDING |
| `collectSample` | `samples` COLLECTED + request IN_PROGRESS (transaction) |
| `enterResult` | `results` row |
| `verifyAndComplete` | result verified_at + request COMPLETED |

Statuses used match schema CHECKs / app conventions: PENDING → IN_PROGRESS → COMPLETED (CANCELLED blocks collection).

## HTTP (`/laboratory`)

- `POST /laboratory/requests`
- `POST /laboratory/requests/:id/samples`
- `POST /laboratory/requests/:id/results`
- `POST /laboratory/requests/:id/results/:resultId/verify`

## Tests

```bash
yarn jest src/modules/laboratory/__tests__/lab-journey.usecase.spec.ts
```

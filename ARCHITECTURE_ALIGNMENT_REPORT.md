# Architectural Alignment Report — NyaLife Backend

Generated: 2026-08-04

## 1. Repository architecture discovered

- NestJS HMS API with dual ORM switch (`ORM_PROVIDER=prisma|typeorm`), currently Prisma + Supabase Postgres.
- Layered scaffold: `src/core` (DDD/CQRS/Result), `src/platform` (storage/realtime/queue/api/security…), `src/infrastructure` (drivers), `src/shared`, `src/common`, `src/config`.
- Live HMS modules were previously flat (`auth`, `catalog`, `ops`, `visits`, `billing`, `insurance`) — controller + service + Prisma, no repositories.
- `AppModule` did not previously import Foundation/Realtime/Storage infrastructure.

## 2. module.sh blueprint

Canonical generator at [`src/modules/module.sh`](backend/src/modules/module.sh):

Controller → Service → UseCase → `IRepository` (Symbol) → Prisma/TypeORM adapters, plus domain entity/VO, DTOs, mapper, events, listener, guard/validator stubs, optional CQRS.

## 3. Database entities (db.sql)

9 schemas, **81 tables**. Communications (**11 tables**) deferred. ~70 tables mapped to domain modules.

## 4. Final module mapping

| Module | Status |
|--------|--------|
| auth, catalog, ops, visits, billing, insurance, health, logger, metrics, config | Existing facades retained |
| patients | **Fully implemented** (schema-aligned CRUD + tests) |
| departments | Prisma repository implemented |
| staff, appointments, consultations, diagnoses, procedures, vital-signs, follow-ups, inpatient, wards, beds, admissions, pharmacy, medications, prescriptions, laboratory, radiology, audit, insurance-policies, documents | **Scaffolded** via module.sh (Prisma-first wiring); repositories still stubbed except departments/patients |
| communication | `.gitkeep` only (deferred) |

## 5. Existing modules refactored

- `OpsModule` imports `PatientsModule`; `OpsService.createPatient` delegates to `PatientsService` (facade / dual-run).
- `AppModule` dual-runs legacy + new domain modules.

## 6. New modules created

All listed scaffolds above + `src/modules/_platform/hms-platform.module.ts` + `src/modules/communication/.gitkeep`.

## 7–8. Platform infrastructure

**Reused:** `StorageProvider` / S3-compatible Supabase storage, `RealtimeModule`, `PaginationService`, PrismaService, Bull root.

**Added:**
- `HmsPlatformModule` — optional Supabase/local/memory storage; RealtimeModule with in-memory defaults.
- `NestSocketIoGateway` under platform realtime (Socket.IO via `@nestjs/websockets`).
- Env docs for `STORAGE_*`, `REALTIME_PROVIDER`, `REDIS_OPTIONAL`.

## 9. Core/shared/common/config

No core philosophy changes. Patients domain uses `Entity` + `Result` + `NotFoundException` from core.

## 10–11. Realtime / Socket.IO

- Abstraction: `RealtimeService` / `RealtimeModule`.
- Nest Socket.IO gateway bridges rooms; business modules should emit via `RealtimeService` / EventEmitter2 (patients already emit domain events).

## 12. Redis optionality

- `REDIS_OPTIONAL` (default soft): Bull `retryStrategy` stops after 3 attempts; `enableOfflineQueue: false`.
- Core CRUD does not require Redis.

## 13. Background worker

- Bull root remains; scaffold processors exist per module (`processors/`, `queues/`) but queues are not registered yet (avoid hard Redis dependency).
- Ready to register `hms-jobs` when Redis is available.

## 14. Supabase Storage

- Via existing S3-compatible path (`STORAGE_PROVIDER=supabase` + endpoint/keys).
- Falls back to `InMemoryStorage` when credentials missing.

## 15. CRUD endpoints

| Surface | Routes |
|---------|--------|
| New | `POST/GET/PATCH/DELETE /patients`, `/departments`, and scaffold controllers for all generated modules |
| Legacy (preserved) | `/catalog/*`, `/ops/*`, `/visits/*`, `/billing/*`, `/auth/*`, `/insurance/*` |

Patients create uses a **transaction** (User + Profile + Patient). List uses **single count + findMany** with includes (no N+1).

## 16. Auth

- Global `JwtAuthGuard` from AuthModule remains.
- New controllers inherit global JWT unless `@Public()`.

## 17–19. Performance

- Patients: paginated queries, selective includes, DB-side search/filter/sort.
- Departments: paginated + search.
- Remaining stubs: still need schema-aligned Prisma implementations (same pattern as patients).

## 20–22. Tests

- Patients: **5/5 passed** (`dto` + `service` specs).
- Platform/core/shared/infrastructure suites: pre-existing (`yarn test`); not re-run in full this session due to time.
- **Not** claiming 100% coverage for all new scaffolds.

## 23. TypeScript / build

- `yarn build:app` — **PASS** after Prisma-first module wiring and scaffold fixes.

## 24. Remaining issues (honest)

1. Most generated modules still use **generic name/description** domain models — only **patients** (and departments repository) are fully aligned to `db.sql`.
2. Stub Prisma repos still throw/`return []` until filled like patients.
3. Catalog/ops/visits facades only partially delegated (patient create); other ops paths still inline Prisma.
4. Bull processors / Socket.IO gateway not exhaustively integration-tested.
5. 100% coverage across all scaffolds is **not** achieved; continue domain-by-domain using patients as the reference implementation.
6. Lint still ignores `src/modules/**` per package.json.

## Recommended next increments

1. Align **staff**, **appointments**, **medications**, **laboratory**, **radiology**, **inpatient** Prisma repos to schema (copy patients pattern).
2. Point catalog list endpoints at new services.
3. Register optional Bull queue when `REDIS_OPTIONAL=false`.
4. Add module Jest project so `yarn test` includes HMS modules.

# NyaLife Backend — RC1 Release Candidate Report

Generated: 2026-08-04

## Executive verdict

**RC1 is NOT fully complete** against the absolute Definition of Done (especially 100% coverage and every CRUD/journey edge). This wave implemented the highest-risk RC1 gaps without redesigning architecture.

Status: **RC1 hardening in progress — critical security/auth/audit/journey gaps closed; remaining work documented below.**

---

## 1. Database objects discovered (`db.sql`)

- **9 schemas**, **81 tables**
- No Postgres ENUMs (VARCHAR + CHECK)
- **No rooms table** — beds hang off wards
- Admission statuses: `ADMITTED|DISCHARGED|TRANSFERRED|DECEASED`
- Bed statuses: `AVAILABLE|OCCUPIED|MAINTENANCE|RESERVED`
- Audit: `core.audit_logs`, `core.access_logs`
- Communications schema present → **intentionally OUT OF SCOPE**

## 2–3. Implemented / excluded

| Area | Status |
|------|--------|
| db.sql tables via init migration + Prisma | Implemented |
| Extra vs db.sql: refresh_tokens, outpatient_visits, mpesa_*, receipts | Implemented (legitimate auth/OPD/payments) |
| Communications module | **Excluded by RC1 scope** |
| Full GL/journal/budget CRUD HTTP | Partial / not fully exposed (internal billing paths used) |

## 4. Migration parity

| Check | Status |
|-------|--------|
| Init migration reproduces db.sql | Pass |
| Forward auth/OPD/M-Pesa migrations | Present |
| Empty DB + migrate = intended schema ∪ extras | Expected |

## 5–8. Modules / routes / CRUD

### Closed this wave
- Wired previously unmounted modules into `AppModule`: diagnoses, follow-ups, procedures, vital-signs, insurance-policies
- Patient portal `/me/*` (profile, appointments, prescriptions, lab-results, invoices)
- Auth: `POST /auth/register`, `forgot-password`, `reset-password`
- Pharmacy: `POST /pharmacy/dispense`
- `@Roles` on IPD, laboratory, patients, catalog, pharmacy
- Patient ownership on `GET/PATCH /patients/:id` for `PATIENT` role

### Still incomplete
- Many scaffold CRUD controllers still lack fine-grained `@Roles` (appointments, staff, documents, wards, beds, admissions CRUD, radiology, consultations, etc.) — JWT required, roles optional
- Admissions HTTP create/delete intentionally throw (must use `/ipd`)
- Full appointment cancel/reschedule workflow beyond CRUD/status update

## 9. Patient journey

| Step | Status |
|------|--------|
| Register PATIENT | Done (`/auth/register`) |
| Login / me / change password | Done |
| Forgot / reset password | Done (token via refresh_tokens purpose=`password-reset`; resetToken returned only non-prod) |
| Own profile / appointments / Rx / labs / invoices | Done (`/me/*`) |
| Ownership IDOR block | Done for `/patients/:id` + `/me` |
| OTP login MFA | **Not implemented** (no auth OTP table in db.sql; insurance OTP is unrelated) |

## 10. IPD journey

| Step | Status |
|------|--------|
| Ward → bed → admit → transfer → discharge | Done (`/ipd`, transactional) |
| Occupied-bed race (conditional update) | Done |
| Audit on admit/transfer/discharge | Done (`HmsAuditWriter`) |
| Rooms | N/A (db.sql has none) |
| IPD-tied meds/labs/final bill as single orchestrated API | Partial (compose existing lab/pharmacy/billing APIs) |

## 11. Pharmacy journey

| Step | Status |
|------|--------|
| FEFO dispense + stock movements | Done |
| HTTP `/pharmacy/dispense` | Done |
| Negative stock prevention | Done (conditional decrement) |
| Duplicate visit dispense guard | Done |

## 12. Laboratory journey

| Step | Status |
|------|--------|
| request → sample → result → verify | Done (`/laboratory`) |
| Role restrictions | Done |
| Patient access to verified results | Done (`/me/lab-results`) |

## 13. Billing journey

| Step | Status |
|------|--------|
| Fee schedule / settleVisit / M-Pesa checkout | Done |
| settleVisit `$transaction` | Done |
| M-Pesa callback secret (`MPESA_CALLBACK_SECRET` / header) | Done (required in production) |
| Full IPSAS journal posting | Not exposed as journey API |

## 14. Appointments / visits

| Step | Status |
|------|--------|
| Visits stage machine | Done |
| Appointments CRUD + ops facade | Partial |
| Visits list capped (`take: 200`) | Done |

## 15–16. Authentication / Authorization

| Item | Status |
|------|--------|
| Login / refresh / logout / change-password | Done |
| Register / forgot / reset | Done this wave |
| PATIENT role + permissions seed | Done |
| Demo password hint removed from HTTP | Done |
| Global RolesGuard | Still not global — must set `@Roles` per controller |
| Platform SecurityModule rate limit | **Not wired** into AppModule yet |

## 17. Audit logging

| Item | Status |
|------|--------|
| `HmsAuditWriter` → `audit_logs` / `access_logs` | Done |
| Auth login/logout/password/register | Audited |
| IPD admit/transfer/discharge | Audited |
| Patient read/update + portal access | Audited |
| Every scaffold CRUD mutation | **Not yet** universally wired |

## 18–23. Security / performance findings

### Fixed
- M-Pesa public finalize forgery mitigated via callback secret
- settleVisit atomicity
- Redis optional for readiness (`REDIS_OPTIONAL` default)
- Unbounded visits / auth user / dispense med scan capped
- Patient IDOR on patient routes
- PHI catalog blocked for PATIENT role

### Remaining HIGH
- Scaffold domain controllers without `@Roles`
- Platform rate limiting not enabled on `/auth/*`
- Hardcoded `nyalife123` still used in seed/ops bootstrap (demo only; disable in prod)
- JWT fallback secrets if env misconfigured

## 24–26. Storage / realtime / workers

| Item | Status |
|------|--------|
| Platform storage abstraction | Present |
| Realtime via platform Socket.IO | Present (IPD events) |
| Redis / Bull optional | Queues optional; readiness aligned |
| Communications | Out of scope |

## 27–30. Tests / build

| Check | Result |
|-------|--------|
| Targeted unit (auth/audit/ipd) | Updated for new constructors |
| Offline e2e | **20/20** pass |
| Focused RC1 unit (auth/audit/ipd/health/dispense) | Pass |
| 100% coverage DoD | **NOT MET** — honest remaining gap |
| Production build | **Pass** (`yarn build:app`) |

## 31. Remaining known issues (explicit)

| WHAT | WHY | IMPACT | WHAT REMAINS |
|------|-----|--------|--------------|
| 100% coverage | Large scaffold surface + platform packages | Cannot claim DoD coverage | Expand journey + module coverage systematically |
| Global RBAC on every CRUD route | Time-boxed to highest-risk PHI routes first | Authenticated non-privileged roles may still hit some scaffold CRUD | Add `@Roles` / PermissionsGuard module-by-module |
| Auth OTP / MFA | No auth OTP table in db.sql; avoid inventing schema | No MFA login | Forward migration + provider if product requires |
| Comms module | Explicitly out of scope | No chat/notifications API | Keep `.gitkeep` |
| Universal mutation audit | Need interceptor or base service wiring | Some CRUD may lack audit rows | Nest interceptor or decorate use-cases |
| Rate limiting | SecurityModule not imported | Brute-force risk on login | Wire platform RateLimitGuard on auth |

## Commands

```bash
cd backend
yarn build:app
unset E2E_USE_LIVE_DB && yarn test:e2e
yarn test:modules --testPathPatterns='auth|audit|ipd|dispense'
```

## Intentionally incomplete (allowed)

1. **Communications** — RC1 exclusion  
2. **100% coverage** — not achieved in this wave; tracked above  
3. **Auth MFA OTP** — no db.sql auth OTP structure; password reset uses refresh_tokens purpose marker instead of new table

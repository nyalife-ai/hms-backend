# Notifications module

Prisma-first domain module (same layout as `patients`). **No TypeORM.**

## Layout

- `domain/` — entity aligned with Prisma `Notifications`
- `use-cases/` — Result workflows (CRUD + `SendSmsUseCase`)
- `repositories/prisma/` — Prisma adapter (`ORM_PROVIDER=prisma`)
- `adapters/` — Africa's Talking SMS implementing platform `SmsProvider`
- `notifications.service.ts` / `notifications.controller.ts` — orchestration + REST

## SMS (Africa's Talking)

Real AT protocol lives **in this module** (not in `src/platform`). Platform keeps a generic stub only.

```bash
AFRICASTALKING_USERNAME=
AFRICASTALKING_API_KEY=
AFRICASTALKING_FROM=          # optional sender / short code
AFRICASTALKING_ENV=sandbox    # or production
```

`POST /notifications/sms` → `{ to, message, from? }`

## Checklist

1. `NotificationsModule` is imported in `AppModule`
2. Set `AFRICASTALKING_*` for outbound SMS
3. `yarn build:app` / `yarn test`

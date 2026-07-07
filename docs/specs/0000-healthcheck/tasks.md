# Tasks: Health-check

> Пример-скелет (ADR 0008 + ADR 0009). Адаптирован под фичу: без доменного
> модуля, без БД, без RQ-хуков.

- Статус: draft
- Дата: 2026-07-07
- План: `./plan.md`

## Порядок

Сверху вниз. Внутри задачи: red (падающий тест) → green (минимальный код) →
refactor.

## Контракты

- [ ] T1. `proto/hema/v1/health.proto` — `HealthService.Check`, `ServingStatus`;
      `make generate`.

## Server

- [ ] T2. **handler (red→green)** — `pkg/health/health_test.go`: `Check`
      возвращает `SERVING` → затем `pkg/health/health.go` (хендлер +
      `Register(mux)`).
- [ ] T3. **auth whitelist (red→green)** — тест в `pkg/health` или
      `pkg/connectutil`: вызов `Check` без `Authorization` не даёт
      `CodeUnauthenticated` → затем добавить путь в whitelist интерсептора.
- [ ] T4. **wiring** — вызвать `health.Register(mux)` в `internal/platform`.

## Web

- [ ] T5. **BFF (red→green)** — `app/api/health/route.test.ts` (mock gRPC:
      `SERVING`→200, `NOT_SERVING`→503) → затем `app/api/health/route.ts`
      (`runtime = "nodejs"`).

## Проверка

- [ ] T6. `make test-all` зелёный.
- [ ] T7. `go build ./...` + `pnpm build`.
- [ ] T8. Обновить статус в `spec.md`/`plan.md`/индекс `docs/specs/README.md`.

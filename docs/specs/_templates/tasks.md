# Tasks: <название фичи>

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft | in progress | done
- Дата: YYYY-MM-DD
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Контракты

- [ ] T1. `proto/hema/v1/<...>.proto` — описать RPC/сообщения; `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Server

- [ ] T2. **domain** — `modules/<name>/domain/domain.go`: сущности, порт
      `Repository`, доменные ошибки. Тест: `service` не собирается без порта
      (компиляционный red через следующий шаг).
- [ ] T3. **service (red→green)** — `service/service_test.go` с fake-репо на
      счастливый путь и доменные ошибки → затем `service/service.go`.
- [ ] T4. **testutil** — `modules/<name>/testutil/fake_repo.go`: in-memory
      `domain.Repository` (`var _ domain.Repository = (*FakeRepo)(nil)`).
- [ ] T5. **repo** — `repo/queries/*.sql` (`-- name: X :one/:many`);
      `make sqlc`; `repo/repo.go` — реализация порта.
- [ ] T6. **migrations** — `migrations/0000N_*.sql` (goose): схема + таблицы.
- [ ] T7. **api (red→green)** — `api/handler_test.go` (httptest + Connect,
      fake-репо): счастливый путь + маппинг доменных ошибок в `connect.Code`
      → затем `api/handler.go`.
- [ ] T8. **wiring** — `module.go` (`Register(...)`) + регистрация в
      `internal/platform`.

## Web

- [ ] T9. **BFF (red→green)** — `app/api/<...>/route.ts` + `*.test.ts` (mock
      fetch/grpc, маппинг `connect.Code`→HTTP).
- [ ] T10. **entities/features** — типы, `api/requests.ts` + `keys.ts` +
      RQ-хуки; тесты fetchers (Vitest). `ui/` компоненты.
- [ ] T11. **widget/route** — сборка на странице.

## Проверка

- [ ] T12. `make test-all` зелёный.
- [ ] T13. `pnpm exec tsc --noEmit` (если менялись protobuf-моки).
- [ ] T14. `go build ./...` + `pnpm build`.
- [ ] T15. Обновить статус спеки/плана/индекс в `docs/specs/README.md`.

_Задачи-шаблон — адаптировать под конкретную фичу: лишние удалить, порядок
сохранить (контракты → server снизу вверх → web → проверка)._

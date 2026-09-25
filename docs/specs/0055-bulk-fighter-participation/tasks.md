# Tasks: Массовое добавление существующих бойцов в номинацию

- Статус: draft
- Дата: 2026-09-25
- План: [plan.md](./plan.md)

## Порядок

До D-BULK выполнять только подготовку документов. После согласования — задачи
сверху вниз; в каждом кодовом инкременте red → green → refactor. Отдельная ветка
и worktree, старт от согласованной базы, gen/sqlc генерируются локально.

## Контракты

- [ ] T0. Зафиксировать D-BULK в spec/plan/tasks, обновить статус spec/plan в
  ready и общий реестр решений. Согласовать владение файлами импорта/ростера.
- [ ] T1. `proto/hema/v1/fighter.proto`: RPC и сообщения по plan; lint,
  `make generate`. Это контрактный шаг перед TDD.

## Server

- [ ] T2. `domain/bulk_participation_test.go` → `bulk_participation.go`:
  AC-3/4/5, порядок ID, enum статусов, естественная идемпотентность,
  removed никогда не превращается в active. Расширить Repository и fake.
- [ ] T3. `service/bulk_participation_test.go` с fake/spy → service:
  общая валидация до записи, один nomination lookup, partial rows,
  корректный summary, повтор после промежуточного сбоя (AC-3..7).
- [ ] T4. `integration/bulk_participation_integration_test.go` (red) →
  SQL/`repo/bulk_participation.go` (green), `make sqlc`: реальные UNIQUE,
  транзакция на строку, конкурентный retry, отсутствие восстановления/потери
  правки при снятии или редактировании. При обнаружении существующей гонки
  одиночной операции выделить минимальный regression fix и согласовать файлы.
- [ ] T5. `api/bulk_participation_handler_test.go` → handler: httptest +
  Connect, 401/403, InvalidArgument/NotFound, частичный успешный отчёт,
  инфраструктурная ошибка. Проверить включение RPC в admin-защиту.

## Web

- [ ] T6. `app/api/admin/fighters/bulk-nomination/route.e2e.test.ts` → route:
  cookie/auth forwarding, validation, real proto round trip, row vs RPC errors.
- [ ] T7. Тесты `api/bulk-participation.test.ts`, mutation → REST/RQ:
  один запрос на список, pending, cache invalidation, transport retry.
- [ ] T8. `model/bulk-selection.test.ts` → reducer; тесты FightersTable/Row
  → checkbox и выбор текущей страницы. AC-1/2, indeterminate, no card opening.
- [ ] T9. Тесты bulk dialog/FightersScreen → диалог и интеграция:
  одна цель, счётчик между страницами, очистка фильтров/tournament, partial
  report, сбой не утверждает откат, выбор доступен для повтора (AC-7/9).

## Проверка

- [ ] T10. Targeted Go/Vitest + `make test-integration` для fighter, затем
  `make test-all`, `cd server && go build ./...`,
  `cd web && pnpm exec tsc --noEmit && pnpm build` и обязательный lint CI.
- [ ] T11. Ручная приёмка: две страницы ростера, withdrawn/removed/merged,
  повтор после разрыва связи, keyboard, мобильный отчёт; проверить отсутствие
  изменения готовой сетки. Сверить итоговый состав с отчётом.
- [ ] T12. Записать результат/ограничения, обновить spec/plan/tasks и индекс
  через координатора; удалить worktree/ветку после объединения.

## Треки и параллельность

Один чат владеет всей фичей: T2–T5 затрагивают общий repository interface и
фейки; T8–T9 общий FightersScreen. Внешняя параллель с аренной UI-задачей и
графом допустима при отсутствии общих файлов. Одновременную правку fighter
контрактов и screen другим чатом не запускать; не переносить gen из worktree.

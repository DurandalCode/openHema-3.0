# Tasks: Доп. поля заявки, поиск и правка админом

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-07-11
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах. Фича —
**расширение** модуля `application` (0005), нового модуля нет.

## Контракты

- [x] T1. `proto/hema/v1/application.proto` — добавить: член enum
      `APPLICATION_EVENT_TYPE_AMENDED = 6`; поля `Application.club`/
      `Application.needs_equipment`; поля `SubmitApplicationRequest.club`/
      `needs_equipment`; RPC `ApplicationAdminService.EditApplication` +
      сообщения `EditApplicationRequest`/`EditApplicationResponse` (с
      `optional nomination_id`/`optional state`). `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Server

- [x] T2. **domain (red→green)** — `modules/application/domain/domain_test.go`
      → `domain.go`: событие `EventAmended`; поля `Club`/`NeedsEquipment`/
      `ApplicantNameOverride` в `Application`/`ApplicationView`; `Payload`
      (submitted: club/needs_equipment; amended: патч + опц. nomination/
      tournament/new_state); `Submit(...)` с новыми аргументами; команда
      `Amend(actorID, patch, now)`; свёртка `apply` для `submitted`/`amended`
      (перенос номинации, ручной статус, правка терминальной — FR-9).
      Тесты: AC-1/AC-2 (подача с полями), AC-3/AC-8/AC-10 (правка/перенос/
      статус), AC-12 (терминальная), AC-13 (Rebuild с amended).
- [x] T3. **service (red→green)** — `service/service_test.go` → `service.go`:
      `Submit` c club/needs_equipment; юзкейс `EditApplication` (load→rebuild→
      resolve номинации при переносе→amend→append); эффективное имя в `enrich`
      (override ?? auth); DTO `Application`/`Participant` + новые поля.
      Тесты: AC-4/AC-5 (имя), AC-9 (перенос в дубль → `ErrDuplicateActive`),
      FR-7 (ручной статус в дубль), несуществующая номинация, обогащение без N+1.
- [x] T4. **testutil** — `modules/application/testutil/fake_repo.go`: расширить
      проекцию тремя полями; обновление club/needs_equipment/override при
      `Append`; partial-unique дубль при переносе/ручном статусе.
      `var _ domain.Repository = (*FakeRepo)(nil)`.
- [x] T5. **repo** — `repo/queries/application.sql`: `UpsertCurrent` (+3 колонки
      в INSERT и DO UPDATE); все SELECT проекции (+3 колонки в выборке).
      `make sqlc`; `repo/repo.go` — маппинг новых колонок в/из `ApplicationView`.
- [x] T6. **migrations** — `migrations/00002_application_details.sql` (goose):
      `ALTER TABLE application.application_current ADD COLUMN club/
      needs_equipment/applicant_name_override` (NOT NULL + DEFAULT); Down —
      `DROP COLUMN`. Журнал `events` не трогаем.
- [x] T7. **api (red→green)** — `api/handler_test.go` → `handler.go`:
      `SubmitApplication` пробрасывает club/needs_equipment; `toProtoApplication`
      заполняет club/needs_equipment + эффективное имя; хендлер `EditApplication`
      (маппинг optional nomination/state → указатели; ошибки→`connect.Code`);
      `toProtoEvent` для `amended`. Тесты: AC-11 (правка обычным `user` →
      `CodePermissionDenied`), AC-13 (история с `AMENDED`), маппинг ошибок.
- [x] T8. **wiring** — `module.go` без изменений (RPC входит в существующий
      `ApplicationAdminService`). Проверить сборку `go build ./...`.
- [x] T9. **integration (БД)** — `integration/*_test.go` (testcontainers):
      миграция `00002` (колонки с дефолтами); правка через `Append` обновляет
      проекцию; перенос/ручной статус в дубль → `uq_current_active_per_user_
      nomination` → `ErrDuplicateActive`; журнал `events` неизменен (amended —
      новая строка).

## Web

- [x] T10. **BFF (red→green)** — `app/api/applications/route.ts` (POST: пробросить
      club/needsEquipment) + edit-роут (`app/api/applications/[id]/edit/route.ts`
      POST, admin, `EditApplication`) + `*.test.ts`: маппинг `connect.Code`→HTTP
      (`AlreadyExists`→409, `NotFound`→404, `Aborted`→409, auth→401/403).
- [x] T11. **entities/features** —
      `entities/application/lib/types.ts` (+`club`/`needsEquipment`, событие
      `amended`); форма подачи (`features/my-applications/ui/submit-application-button.tsx`:
      клуб + чекбокс экипировки; `requests.ts`/хук); `features/my-applications`
      (показ клуба/экипировки в карточке заявки); `features/application-review`
      (`requests.ts` + `use-edit-application`; тесты fetchers). Vitest на
      сериализацию и хуки.
- [x] T12. **ui** — форма правки заявки (`application-review/ui/edit-application-dialog.tsx`:
      клуб, экипировка, имя-override, селект номинации, селект статуса);
      поле **поиска** в `applications-overview.tsx` (клиентский матч по имени +
      клубу, регистронезависимо, в комбинации с фильтрами — AC-6/AC-7); показ
      клуба/экипировки в admin-строке. Компонентных тестов в проекте нет
      (см. `web/AGENTS.md`: Vitest — только для чистой логики, скриншотных
      тестов нет намеренно, ADR 0003); проверено вручную через dev-стек
      (см. T16).

## Проверка

- [x] T13. `make test-all` зелёный.
- [x] T14. `pnpm exec tsc --noEmit` (protobuf-моки менялись) — чисто.
- [x] T15. `go build ./...` + `pnpm build` — оба успешны.
- [x] T16. Полный докер-стек не требуется (модуль не новый). Миграция `00002`
      прогнана через `make migrate` на локальном dev-Postgres (не
      testcontainers) — колонки применились с дефолтами на существующей
      проекции. Дополнительно вручную пройден golden path через реальный
      сервер+web dev-стек (curl по BFF, т.к. браузерного инструмента нет):
      подача заявки с club/needsEquipment → видно в ответе; admin-правка
      (club/needsEquipment/имя-override) → видно в `GetApplication` и в
      публичном стартовом листе (AC-4); перенос в другую номинацию +
      ручная смена статуса за один вызов `EditApplication` (AC-8/AC-10);
      история несёт `AMENDED`-события, не переписывая `SUBMITTED` (AC-13);
      обычный `user` получает 403 на правку (AC-11). UI-страницы
      (`/admin/applications`, `/`, `/dashboard`) отрендерены и содержат
      новые элементы («Поиск по имени или клубу», «Клуб (необязательно)»,
      «Нужна экипировка»); ошибок в логе Next.js dev-сервера нет.
- [x] T17. Обновить статус спеки/плана/tasks и индекс в `docs/specs/README.md`.

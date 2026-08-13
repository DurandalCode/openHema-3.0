# Tasks: Редизайн экрана «Бойцы»

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-08-13
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

Дизъюнктных кусков два, и оба зависят только от контракта (T1): серверный
маппинг (`server/modules/fighter/api/*`) и клиентский «контрактный» срез
(`web/src/lib/grpc/serialize.ts`, `entities/fighter/*`,
`features/fighter-management/lib/*`). UI-сборка трогает файлы того же
феатур-среза, что трек B, поэтому идёт отдельной волной после него.

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 0     | —    | T1     | `proto/hema/v1/fighter.proto`         | —          |
| 1     | A    | T2     | `server/modules/fighter/api/*`        | волна 0    |
| 1     | B    | T3–T5  | `web/src/lib/grpc/serialize*.ts`, `web/src/app/api/admin/fighters/route.test.ts`, `web/src/entities/fighter/lib/*`, `web/src/features/fighter-management/lib/*` | волна 0 |
| 2     | —    | T6–T12 | `web/src/features/fighter-management/ui/*`, `app/(admin)/admin/fighters/page.tsx` | трек B смержен |
| 3     | —    | T13–T16| проверка и документация               | всё выше   |

## Контракты

- [x] T1. `proto/hema/v1/fighter.proto` — добавить в `Fighter` поле
      `bool from_application = 10;` с комментарием «признак, не
      идентификатор заявителя» (plan «Контракты»); `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Server

- [x] T2. **api (red→green)** — `modules/fighter/api/handler_test.go`:
      `ListRoster` отдаёт `from_application = true` для бойца из
      регистрации заявки и `false` для заведённого вручную (fake-репо с
      обоими вариантами `OriginUserID`) → затем одна строка в
      `toProtoFighter` (`handler.go`). Домен, сервис, репозиторий и
      миграции **не трогаются**.

## Web — контрактный срез (трек B)

- [x] T3. **BFF-сериализация (red→green)** — `lib/grpc/serialize.test.ts`:
      `fighterToJson` переносит `fromApplication`, при опущенном proto3-поле
      даёт `false` → затем поле в `fighterToJson`. Дополнить
      `app/api/admin/fighters/route.test.ts` формой ответа с новым полем.
- [x] T4. **entities/fighter (red→green)** — `lib/labels.test.ts`:
      `fighterStatusLabel`, `withdrawalReasonLabel` (включая `UNSPECIFIED`
      → `null`), `participationLabel`, `originLabel` → затем
      `lib/labels.ts`; в `lib/types.ts` — `fromApplication: boolean`.
- [x] T5. **features/fighter-management/lib (red→green)** —
      `lib/select-fighters.test.ts`: `sortFighters` (активные выше
      выбывших, по имени внутри группы — AC-1), `filterFighters` (каждый
      фильтр и все вместе; снятое участие не проходит фильтр номинации —
      AC-4; «Без клуба»; регистр поиска — AC-3), `statusCounts` (не зависят
      от выборки — AC-2), `clubOptions`, `addableNominations` (AC-9) →
      затем `lib/select-fighters.ts`.

## Web — экран (волна 2)

- [x] T6. **строка (red→green)** — `ui/fighter-row.test.tsx`: пять колонок,
      теги участий со свёрткой «+N», приглушение и зачёркивание выбывшего,
      причина под статусом, происхождение с датой, клик по строке открывает
      карточку, клик по кнопке — нет (AC-1/AC-5/AC-7) → затем
      `ui/fighter-row.tsx` на `TableRow`.
- [x] T7. **фильтры (red→green)** — `ui/fighters-filters.test.tsx`: чипы со
      счётчиками и множественным выбором, подписи выпадающих списков
      номинаций и клубов («Все …» / имя / «N …»), поиск, сброс (AC-3) →
      затем `ui/fighters-filters.tsx`.
- [x] T8. **таблица (red→green)** — `ui/fighters-table.test.tsx`: скелетон
      в форме таблицы, ошибка загрузки с повтором, два различающихся пустых
      состояния (AC-16) → затем `ui/fighters-table.tsx` (`TableHead` + строки).
- [x] T9. **перевод (red→green)** — `ui/move-fighter-dialog.test.tsx`:
      целевые номинации отобраны правилом FR-15, подтверждение зовёт
      `useMoveFighter` один раз с обеими номинациями (AC-8) → затем
      `ui/move-fighter-dialog.tsx`. **Первый вызов `MoveFighter` из UI.**
- [x] T10. **карточка бойца (red→green)** — `ui/fighter-card-dialog.test.tsx`:
      состав карточки и действия по состоянию участия (AC-6), правка
      имени/клуба с инлайн-ошибкой (AC-14), подтверждение вывода с текстом
      последствий и тост **без** «Отменить» (AC-10, FR-18/FR-19), возврат
      без подтверждения (AC-11), карточка остаётся открытой после действия
      (FR-16), исчезновение бойца из ростера закрывает карточку (plan
      «Риски») → затем `ui/fighter-card-dialog.tsx` (перенос
      `UiFighterCard`, ADR 0015 п.5).
- [x] T11. **модалка заведения (red→green)** —
      `ui/create-fighter-dialog.test.tsx`: пустое имя даёт инлайн-ошибку и
      не закрывает модалку, успех даёт тост и очищает форму (AC-13) →
      затем `ui/create-fighter-dialog.tsx`.
- [x] T12. **экран и роут (red→green)** — `ui/fighters-screen.test.tsx`
      (моки `useRoster`, мутаций и `shared/lib/toast`): порядок, счётчики,
      комбинация фильтров, тост-ошибка **без** «Повторить» (AC-12), шапка
      раздела с крошкой/счётчиком/действием (AC-15), состояния экрана
      (AC-16), сброс страницы при смене фильтра (AC-17) → затем
      `ui/fighters-screen.tsx`; `app/(admin)/admin/fighters/page.tsx`
      переводится на `FightersScreen` (без `AdminHeader` и узкой обёртки,
      ветка «активный турнир не найден» сохраняется);
      `ui/fighter-roster.tsx` **удаляется**.

## Проверка

- [x] T13. `make test-all` зелёный.
- [x] T14. `pnpm exec tsc --noEmit` + `pnpm build` + `go build ./...`.
- [~] T15. Ручной смоук на `make dev`: частично — в этой среде нет браузерного
      инструмента (headless Chromium/Playwright недоступны), поэтому UI
      кликами не пройден. Сделано вместо этого: `make dev` +
      `make demo-registered` подняты, залогинен admin через реальный BFF
      (`/api/auth/login`), `/admin/fighters` отдаёт 200 без ошибок, `GET
      /api/admin/fighters` подтверждает `fromApplication=true` у всех 15
      бойцов из заявок, `POST /api/admin/fighters` — ручное заведение даёт
      `fromApplication=false`. Не проверено кликами: фильтры/поиск, перевод
      между номинациями, вывод с турнира и **реконсиляция со `stage`**
      (боец пропадает из группы на экране посева, возврат кладёт в
      «нераспределённые») — эти сценарии покрыты только автотестами
      (`fighter-card-dialog.test.tsx`, `move-fighter-dialog.test.tsx` на
      моках мутаций), не сквозной проверкой через реальный `stage`. Требует
      добора вручную в браузере или через `/run-skill-generator`.
- [x] T16. Обновить `docs/design-sync.md` (строка «Бойцы»: «новый API
      нужен» — признак происхождения; путь `UiFighterCard` →
      `features/fighter-management/ui/fighter-card-dialog.tsx`), статусы
      `spec.md`/`plan.md`/`tasks.md` и строку 0026 в `docs/specs/README.md`.

_Задачи-шаблон адаптированы под фичу: серверных слоёв, кроме `api`, здесь
нет — домен, сервис, репозиторий и миграции не меняются._

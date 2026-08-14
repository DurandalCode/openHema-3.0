# Tasks: Редизайн экрана «Номинации»

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-14
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

Контрактов и серверных задач в этом инкременте нет: `/proto` и `/server` не
меняются (plan «Контракты», «Server»), поэтому чеклист начинается сразу с
web.

## Треки и параллельность

Дизъюнктных кусков два, и они не зависят друг от друга: чистые функции
представления (`entities/*`) и слой данных фичи (`features/nomination-
management/api/*`, включая удаление мёртвого вызова). Сборка экрана трогает
`features/nomination-management/ui/*` и ждёт оба трека — подписи берёт из
трека A, данные из трека B.

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 1     | A    | T1–T2  | `web/src/entities/stage/lib/labels*.ts`, `web/src/entities/nomination/lib/types*.ts` | — |
| 1     | B    | T3–T5  | `web/src/features/nomination-management/api/**` | — |
| 2     | —    | T6–T9  | `web/src/features/nomination-management/ui/**`, `app/(admin)/admin/nominations/page.tsx` | треки A и B смержены |
| 3     | —    | T10–T13 | проверка и документация              | всё выше   |

## Web — чистые функции представления (волна 1, трек A)

- [x] T1. **сводка схемы и счётчик ошибок (red→green)** —
      `entities/stage/lib/labels.test.ts`: `stageSchemaSummary` даёт
      «Группы (4) → Сетка (8)» для двух этапов подряд (AC-3), параллельные
      ветки одного уровня перечисляет через « + » (0019, FR-10), возвращает
      пусто для номинации без этапов и для единственного группового этапа
      без заданного числа групп (авто-этап 0017/0019 — AC-3, вторая
      половина); `schemaErrorCount` считает только `SEVERITY_ERROR` и
      игнорирует warning/info (AC-4) → затем обе функции в
      `entities/stage/lib/labels.ts` поверх существующей
      `groupStagesByLevel`; подпись «Группы (N)»/«Сетка (N)» выносится в
      общий хелпер с приватной `formatStageSpecSummary` (вторую реализацию
      не заводить). Строку «Схема не задана» функция **не** возвращает —
      это дело UI (plan `entities/stage/`).
- [x] T2. **короткий статус приёма (red→green)** —
      `entities/nomination/lib/types.test.ts`: `nominationStatusTag` на
      `OPEN`/`CLOSED`/`ACTIVE`/`FINISHED`/`UNSPECIFIED` — «Приём открыт»,
      «Приём закрыт», «Бои идут», «Завершена» (AC-2) → затем функция в
      `entities/nomination/lib/types.ts`. Существующую
      `nominationStatusLabel` не трогать — её зовут другие экраны.

## Web — слой данных фичи (волна 1, трек B)

- [x] T3. **мёртвый вызов (red→green)** —
      `features/nomination-management/api/requests.test.ts`: кейсы
      `getPoolLayoutStatusRequest` удалены → затем из `api/requests.ts`
      удаляются fetcher и типы `PoolLayoutStatus`/`PoolLayoutStatusResult`,
      из `api/keys.ts` — ключ `poolLayoutStatus`, файл
      `api/use-pool-layout-status.ts` удаляется целиком (spec FR-17, AC-16).
      Ручку `pool-status` **не восстанавливать**.
- [x] T4. **fetcher этапов и статус отказа (red→green)** —
      `api/requests.test.ts`: `listNominationStagesRequest` (успех со
      `stages`+`issues`, ошибка HTTP, ошибка сети) и
      `reopenRegistrationRequest`, возвращающий `status: 409` в ветке отказа
      → затем свой fetcher в `api/requests.ts` (не импорт из
      `features/stage-management` — границы FSD, plan «Риски»), ключ
      `stages` в `api/keys.ts`, проброс HTTP-статуса в
      `postNominationAction`.
- [x] T5. **гейты и тексты приёма (red→green)** —
      `api/registration-gate.test.ts`: `canReopen(status)` без
      `hasDistributedFighters`, `canClose` как раньше,
      `reopenBlockedReason` для `ACTIVE`/`FINISHED` (AC-10),
      `registrationErrorMessage(409)` — русская формулировка причины,
      прочие статусы — общая (AC-11) → затем правки
      `api/registration-gate.ts`. Здесь же — `api/use-nomination-schemas.ts`
      (`useQueries` по номинациям, `staleTime` ~60 с, `retry: false`, без
      `refetchInterval`, отдаёт `Map<id, { stages; issues; isError }>`);
      отдельного теста хука не пишем — проверяется через T6/T9 (мокать
      `useQueries` бессмысленно, как в 0027, T6).

## Web — экран (волна 2)

- [ ] T6. **строка (red→green)** —
      `features/nomination-management/ui/nomination-row.test.tsx`: шесть
      колонок (AC-1), статус приёма текстом на всех четырёх значениях
      (AC-2), сводка схемы и «Схема не задана» (AC-3), маркер «N ошибок»
      (AC-4), «схема недоступна» (AC-5), подписанные действия и переходы
      «Схема»/«Заявки» с предвыбранной номинацией (AC-14), клик по строке
      никуда не уводит (AC-14), «Открыть приём» недоступно в фазе боёв с
      объяснением (AC-10) → затем `ui/nomination-row.tsx` на `TableRow`
      (+ `ui/nomination-schema-cell.tsx`, если ячейка вырастет).
- [ ] T7. **таблица (red→green)** — `ui/nominations-table.test.tsx`:
      скелетон в форме таблицы, ошибка загрузки с кнопкой повтора, пустое
      состояние с подсказкой завести первую номинацию (AC-15) → затем
      `ui/nominations-table.tsx` (`TableHead` + строки).
- [ ] T8. **модалки (red→green)** — `ui/create-nomination-dialog.test.tsx`
      (пустое название → инлайн-ошибка, модалка не закрывается; успех →
      тост — AC-7) и `ui/edit-nomination-dialog.test.tsx` (правка описания
      и вместимости уходит в мутацию, «не задано» отличается от 0 — AC-8)
      → затем обе модалки по образцу `create-arena-dialog.tsx` /
      `edit-arena-dialog.tsx` (0027).
- [ ] T9. **экран и роут (red→green)** — `ui/nominations-screen.test.tsx`
      (моки `useNominations`, `useNominationSchemas`, мутаций и
      `shared/lib/toast`): шапка с крошкой, заголовком «Номинации» и
      счётчиком «N номинаций · M с открытым приёмом» (AC-6), подпись о
      смысле порядка и перестановка соседних строк (AC-1, AC-13), закрытие
      приёма с `toastUndo`, зовущим переоткрытие (AC-9), тост-ошибка отказа
      **без** «Повторить» (AC-11), удаление через `ConfirmDialog` с
      `confirmWord` и **без** `toastUndo` (AC-12) → затем
      `ui/nominations-screen.tsx`; `app/(admin)/admin/nominations/page.tsx`
      переводится на `NominationsScreen` (без `AdminHeader`, без узкой
      обёртки `max-w-3xl`, ветка «активный турнир не найден» сохраняется);
      `ui/nomination-management.tsx` **удаляется**.

## Проверка

- [ ] T10. `make test-all` зелёный (сервер не задет — подтверждаем, а не
      правим).
- [ ] T11. `pnpm exec tsc --noEmit` + `pnpm build` + `go build ./...`.
- [ ] T12. Ручной смоук на `make dev` (+ `make demo-bouts` для номинации в
      фазе боёв): открыть `/admin/nominations` — убедиться, что **запросов
      `pool-status` в сетевом логе нет** (AC-16), сводка схемы совпадает с
      экраном этапов у номинации с группами и сеткой (AC-3), «Открыть
      приём» недоступна у номинации с идущими боями (AC-10), отказ
      переоткрытия у закрытой посевом номинации показывается по-русски
      (AC-11), удаление требует ввода названия (AC-12), закрытие приёма
      отменяется из тоста (AC-9). Если браузерного инструмента в среде нет —
      сделать функциональный смоук через реальный BFF и **явно записать в
      этой задаче, что осталось непроверенным** (как в 0026/0027).
- [ ] T13. Обновить `docs/design-sync.md` (строка «Номинации»: аннотация
      «редизайн — спека 0028», новые/удалённые файлы; графа «новый API
      нужен?» остаётся «нет»), статусы `spec.md`/`plan.md`/`tasks.md`
      (`done`) и строку 0028 в `docs/specs/README.md`.

_Задачи-шаблон адаптированы под фичу: контрактов и серверных слоёв здесь
нет — `/proto` и `/server` не меняются._

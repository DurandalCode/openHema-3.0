# Plan: Редизайн страницы этапа

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-08-15
- Спека: `./spec.md`

## Обзор решения

Инкремент целиком клиентский: `/proto`, Go-сервер и схема БД не меняются
(NFR-1). Композиция страницы переезжает из `page.tsx` в новый виджет
`widgets/stage-page/` (NFR-2) — сегодня страница импортирует две фичи прямо
из роут-файла; после инкремента `page.tsx` рендерит один виджет, а виджету
импортировать фичи разрешено (правило 6 `web/AGENTS.md`).

Виджет владеет каркасом: `PageHeader` (статус, сводка, фиксация состава —
забраны из внутренних тулбаров фич, FR-3), карточки сводки этапа, строка
действий формирования и правый рельс. Телом остаётся существующий экран
посева, выбранный по типу этапа (FR-9). Server-state берётся хуками TanStack
Query из фич по тем же ключам, что использует тело, — общий кэш, без
дублирующих запросов.

Одна правка **на стороне BFF-сериализации**: `Stage.execution_status`
(0021) сервер отдаёт уже сегодня, а `stageToJson` его молча теряет — без
него нечем заполнить статус этапа в шапке (FR-5) и в рельсе (FR-17). Это
расширение DTO и сериализатора, не контракта.

## Контракты (proto)

**Не меняются.** Сверка того, что требует спека, с существующим кодом:

| Требование | RPC / BFF-маршрут | Состояние |
| --- | --- | --- |
| Этап + схема + диагностика (FR-2/FR-17/FR-19) | `ListStages` → `GET /api/nominations/[id]/stages` | есть, отдаёт `issues` (0020 FR-8) |
| Статус выполнения этапа (FR-5) | поле `Stage.execution_status` (0021) | **есть в proto и в ответе сервера, теряется в `stageToJson`** |
| Раскладка группового этапа (FR-9) | `GetLayout` → `GET /api/stages/[stageId]/layout` | есть |
| Сетка (FR-9/FR-21) | `GetBracket` → `GET /api/stages/[stageId]/bracket` | есть |
| Фиксация состава (FR-2/FR-3) | `SetLayoutStatus` → `POST /api/stages/[stageId]/status` | есть |
| Превью формирования (FR-15) | `PreviewStageBuild` → `POST /api/stages/[stageId]/build/preview` | есть |
| Формирование (FR-12) | `BuildStage` → `POST /api/stages/[stageId]/build` | есть |
| Сброс состава (FR-14) | `ResetLayout` → `POST /api/stages/[stageId]/reset` | есть (общий путь для групп и сетки) |
| Отмена последнего действия (FR-12) | `Undo` → `POST /api/stages/[stageId]/undo` | есть |
| Прогресс боёв по этапам (FR-18) | `GetNominationLive` → `GET /api/nominations/[id]/live-snapshot` | есть: `Pool.stage_id` + `BoardBout.state`, `Bracket.stage` + `BracketPair.bout` |

Новых BFF-маршрутов не заводим.

## Server (модули и слои)

**Не затрагивается.** Ни один Go-модуль не меняется, миграций нет.

## Web (FSD + BFF)

### BFF-сериализация

- `lib/grpc/serialize.ts` — `stageToJson` добавляет `executionStatus`
  (enum-строка `STAGE_STATUS_*`, как остальные enum-поля: `toJson` отдаёт
  полное имя, доп. маппинг не нужен; отсутствие → `STAGE_STATUS_UNSPECIFIED`).
  Затрагивает **все** ответы, где едет `Stage` (список этапов, ответы
  create/update/delete/rule/status, живой снапшот) — аддитивно, существующие
  потребители не ломаются.

### `entities/stage`

- `lib/types.ts` — `StageStatus` (`STAGE_STATUS_DRAFT|READY|ACTIVE|FINISHED`)
  + поле `executionStatus` в `Stage`.
- `lib/labels.ts` — `stageExecutionStatusLabel(status)`: «черновик» / «готов»
  / «идут бои» / «завершён» (FR-5/FR-17).
- `lib/progress.ts` (новый) — чистая функция
  `stageProgressFromSnapshot(snapshot): Record<stageId, StageProgress>`, где
  `StageProgress = { fighters: number; boutsTotal: number; boutsFinished: number }`
  (FR-18, NFR-5):
  - групповые этапы — из `snapshot.pools`: группировка по `pool.stageId`,
    `fighters` = сумма `members.length`, бои — `pool.bouts` со `state`;
  - сетки — из `snapshot.brackets`: `bracket.stage.id`, бойцы — занятые
    слоты первого круга, бои — материализованные `pair.bout`;
  - этап без записи в снапшоте (черновик — `pools` пуст, пока раскладка
    draft) отсутствует в результате: рельс показывает конфиг и статус без
    счётчиков (FR-18, второй кейс), а не «0 из 0».

### Роут

- `app/(admin)/admin/nominations/[id]/stages/[stageId]/page.tsx` — остаётся
  server component: `getNomination(id)` + `getStages(id)`, `notFound()` при
  отсутствии номинации/этапа (FR-27), рендерит один
  `<StagePageScreen nomination={...} stageId={stageId} initialStages={...} />`.
  `AdminHeader`, кнопка «← Все этапы», `max-w-6xl`-колонка и выбор виджета по
  типу этапа уходят из роут-файла в виджет (NFR-2, FR-10).

### `widgets/stage-page/` — композиция страницы

| Файл | Роль |
| --- | --- |
| `stage-page-screen.tsx` (новый) | Корень (`"use client"`): `PageHeader` (FR-2..FR-5), карточки сводки, строка действий (FR-12), тело по типу этапа (FR-9), рельс. Зовёт `useStages(nominationId)` с `initialData`, `useLayout`/`useBracket` для сводки и `useSetLayoutStatus` для фиксации |
| `stage-summary-cards.tsx` (новый) | Три карточки: статус этапа, правило отбора (подпись + ссылка на схему, FR-6..FR-8), заполнено |
| `stage-actions.tsx` (новый) | «Сформировать»/«Сформировать заново» (гейт FR-13), «Отменить последнее действие», «Сбросить этап» + `ConfirmDialog` (FR-14) |
| `stage-rail.tsx` (новый) | Список этапов номинации со сводкой и счётчиками (FR-17/FR-18) + диагностика схемы (FR-19) |
| `stage-page-skeleton.tsx` (новый) | Скелетон в форме каркаса (FR-26) |

Сводка для шапки: у группового этапа — `poolLayoutCounts(layout)` (уже есть,
0030), у сетки — занятые/всего слотов из `useBracket`. Оба хука бьют по тем
же ключам, что и тело, — второй сети не создаётся.

Прогресс рельса: `useLiveSnapshot(nominationId)` (см. ниже) →
`stageProgressFromSnapshot`. После формирования/сброса/фиксации виджет
инвалидирует ключ снапшота — счётчики соседних этапов не залипают.

### `features/nomination-live/`

- `api/keys.ts` + `api/use-live-snapshot.ts` (новые) — `useQuery` на
  `GET /api/nominations/[id]/live-snapshot` (unary, уже существующий
  маршрут). Отдельно от `use-nomination-live.ts` (SSE-хук публичной
  страницы, требует `initialSnapshot` и держит стрим): админскому рельсу
  нужен обычный запрос с кэшем и инвалидацией, а не push-канал.

### `features/nomination-pools/`

- `ui/nomination-pools.tsx` — из внутреннего тулбара **убираются** статус,
  сводка «N/M распределено · K пула» и кнопка «Зафиксировать»/«Вернуть в
  черновик» (переехали в `PageHeader`, FR-3). Остаются «+ Пул»,
  «Распределить автоматически», «Отменить», «Сбросить раскладку», DnD и
  read-only-режим при `ready`. Единственный потребитель компонента — эта
  страница (`grep` по `web/src`), поэтому флага совместимости не заводим.

### `features/bracket-seeding/` — редизайн (FR-21..FR-25)

- `ui/bracket-seeding.tsx` — по образцу `nomination-pools` после 0030:
  постоянный `mutationError`-баннер убирается целиком, все мутации дают
  тост-успех/тост-ошибку (`shared/lib/toast`), сброс посева — `toastUndo` на
  общий undo-слот (FR-22), скелетон в форме экрана вместо `SkeletonCards`
  (FR-23), ошибка загрузки с кнопкой «Повторить» (FR-24), различимые пустые
  состояния (FR-25). Статус/сводка/фиксация — вверх, в `PageHeader` (FR-3).
- `api/errors.ts` (новый) — перевод отказов по HTTP-статусу, приём
  0028/0029/0030 (`nomination-pools/api/errors.ts` — образец; импортировать
  соседнюю фичу нельзя, санкционированный дубль тонкого модуля).
- `widgets/bracket-view/bracket-view.tsx` — точечный рестайл токенами
  0022 (read-only-проекция сетки; её публичный редизайн — спека 0035).

### `features/stage-build/` — окно формирования (FR-15/FR-16)

- `ui/build-stage-dialog.tsx` — становится **управляемым** (`open` /
  `onOpenChange`, `DialogTrigger` опционален), как `create-stage-dialog`
  после 0031: диалог открывают и карточка схемы (0031 FR-11), и строка
  действий страницы этапа (FR-12). Рестайл по макету 17b: строка «Отобрано N
  из M мест», предупреждение/ошибка блоками 0022, объяснение блокировки
  кнопки (FR-16), номера требований («FR-15», «FR-22», «FR-11») из
  пользовательских текстов убираются.
- `lib/build-gate.ts` (новый) — чистая функция
  `buildBlockedReason(preview): string | null` («пока есть неразрешённые
  дележи» / «пока есть пересечение веток» / `null` — можно формировать):
  один источник и для `disabled`, и для подписи (FR-16).

### Server components vs client

`page.tsx` — server component (SSR + gRPC напрямую, как сейчас: 404 и
initial-данные). Виджет и всё под ним — client (DnD, мутации, тосты).

### State

Server-state — TanStack Query по ключам фич; UI-state страницы (открытость
окна формирования, подтверждение сброса) — `useState` в виджете (ADR 0006:
локальный UI-state одного экрана).

## События

> Placeholder. Event-Driven Design введён ADR 0011 для доменных событий
> сервера; этот инкремент — клиентский.

- Издаёт: нет
- Потребляет: нет

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- Юнит (Vitest, чистые функции): `stageProgressFromSnapshot` (группы, сетки,
  черновик без записи, смешанная схема), `stageExecutionStatusLabel`,
  `buildBlockedReason`, `bracket-seeding/api/errors.ts`.
- Web-компоненты (Vitest + Testing Library, хуки замоканы — приём 0030/0031):
  - `stage-page-screen.test.tsx` — шапка и сводка (AC-1/AC-2), выбор тела по
    типу этапа (AC-3), скелетон и ошибка (AC-15);
  - `stage-actions.test.tsx` — открытие превью (AC-4), гейт «Сформировать
    заново» (AC-5), сброс с подтверждением и отказ сервера (AC-6), undo
    (AC-7);
  - `stage-rail.test.tsx` — порядок, пометка «текущий», навигация (AC-11),
    счётчики и их отсутствие у черновика (AC-12), диагностика и «Схема
    корректна» (AC-13);
  - `build-stage-dialog.test.tsx` (существующий, дополняется) — дележи и
    подпись блокировки (AC-8), пересечения (AC-9), незавершённый источник
    (AC-10);
  - `bracket-seeding.test.tsx` (существующий, переписывается под редизайн) —
    тосты вместо баннера, `toastUndo` на сбросе, скелетон, «Повторить»
    (AC-14).
- BFF (Vitest): `serialize.test.ts` — `stageToJson` отдаёт
  `executionStatus`, включая proto3-omitted (`STAGE_STATUS_UNSPECIFIED`).
- Границы слоёв (AC-16) — проверяется грепом импортов `features/**` в
  verification-задаче, как в 0031.

## Риски и открытые вопросы

- **Перенос статуса/сводки/фиксации из тулбаров (FR-3)** трогает уже готовый
  код 0030 и его тесты — самый вероятный источник регрессий инкремента.
  Смягчение: тесты фич правятся в тех же задачах, что и компоненты.
- **`executionStatus` в `stageToJson`** — аддитивное поле в DTO, которое
  едет во всех ответах со `Stage`; протобуф-моки в существующих тестах
  собираются через `create(StageSchema, ...)`, поэтому `tsc` поймает
  расхождения. Локально обязателен `pnpm exec tsc --noEmit`.
- **Счётчики рельса из живого снапшота** — снапшот задуман публичным
  (`StagePublicService`, без авторизации) и не отдаёт админский посев; для
  счётчиков этого достаточно, но если снапшот когда-нибудь сузят, рельс
  потеряет счётчики (не статус и не конфиг — они из `ListStages`).
- **Ширина страницы (FR-10)** — первый админский экран с двухколоночным
  каркасом «тело + рельс» поверх DnD-сетки; при узких вьюпортах рельс уходит
  вниз (FR-11), это проверяется вручную, скриншотных тестов проект не ведёт
  (ADR 0003).

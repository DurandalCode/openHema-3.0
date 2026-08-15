# Plan: Редизайн экрана «Схема номинации»

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-08-15
- Спека: `./spec.md`

## Обзор решения

Инкремент целиком клиентский: `/proto`, Go-сервер и схема БД не меняются
(NFR-1) — все нужные RPC уже есть, включая `SetStageRule`, у которого до сих
пор не было UI. Композиция экрана переезжает из фичи в **виджет**
`widgets/nomination-schema/` (NFR-2), что попутно устраняет нарушение правила
6 `web/AGENTS.md`: сегодня `features/stage-management/ui/stage-management.tsx`
импортирует четыре соседние фичи, а виджету импортировать фичи разрешено.

Виджет владеет UI-состоянием конструктора (выделенный этап, активный drag,
предзаполнение диалога создания, взведённый чип пресета) через `useState`
(ADR 0006 — это локальный UI-state одного экрана, не cross-component), а
server-state берёт хуками TanStack Query из фич. Перетаскивание — тот же
`@dnd-kit` с `PointerSensor`, что в 0030, поверх чистой функции разбора
броска в `entities/stage/lib/`.

## Контракты (proto)

**Не меняются.** Сверка ручек, которых требует спека, с существующим кодом:

| Требование | RPC / BFF-маршрут | Состояние |
| --- | --- | --- |
| Схема + диагностика (FR-6..FR-9) | `ListStages` → `GET /api/nominations/[id]/stages` | есть, отдаёт `issues` (0020 FR-8) |
| Создание этапа (FR-13/FR-14) | `CreateStage` → `POST .../stages` | есть |
| Правка названия и конфига (FR-19/FR-20) | `UpdateStage` → `PUT /api/stages/[stageId]` | есть |
| **Правило отбора (FR-21)** | `SetStageRule` → `PUT /api/stages/[stageId]/rule` | **есть, но без UI** — `useSetStageRule` не вызывается ниоткуда |
| Фиксация состава (FR-22) | `SetLayoutStatus` → `POST /api/stages/[stageId]/status` | есть (используется 0030 и `bracket-seeding`) |
| Удаление этапа (FR-24) | `DeleteStage` → `DELETE /api/stages/[stageId]` | есть |
| Пресеты (FR-25..FR-27) | `ListFormatPresets` / `ApplyFormat` / `SaveFormatPreset` | есть |
| Правка номинации (FR-2) | `UpdateNomination` → `PUT /api/nominations/[id]` | есть |
| Чтение номинации на клиенте | `GetNomination` → `GET /api/nominations/[id]` | есть |
| Приём заявок (FR-4) | `POST .../close-registration` / `.../reopen-registration` | есть |

Новых BFF-маршрутов не заводим.

## Server (модули и слои)

**Не затрагивается.** Ни один Go-модуль не меняется, миграций нет.

## Web (FSD + BFF)

### Роут

- `app/(admin)/admin/nominations/[id]/stages/page.tsx` — остаётся server
  component: `getNomination(id)` + `getNominationResults(id)`. Убирает
  `AdminHeader` и кнопку «← Все номинации» (переезжают в `PageHeader` внутри
  экрана, FR-1), рендерит `<NominationSchemaScreen nomination={nomination} />`
  и, как сейчас, `<NominationResults results={results} showUnfinished />`
  (вне скоупа, сохраняется).

### `widgets/nomination-schema/` — композиция экрана

| Файл | Роль |
| --- | --- |
| `nomination-schema-screen.tsx` (новый) | Корень (`"use client"`): `PageHeader` (FR-1), шапка номинации, строка диагностики, тулбар пресетов, `DndContext`, палитра, холст, инспектор. Держит `selectedStageId`, `createPrefill`, состояние загрузки/ошибки схемы (FR-28/FR-29). Зовёт `useStages(nominationId)` |
| `schema-diagnostics.tsx` (новый) | Строка состояния схемы (FR-6): «Схема корректна» либо счётчики по классам |
| `schema-palette.tsx` (новый) | Палитра из трёх draggable-элементов + подсказка (FR-12) |
| `schema-canvas.tsx` (новый) | Ряды уровней с подписью «Уровень N» (FR-8), зона броска с кнопками «+ Группы»/«+ Плейофф» (FR-17/FR-30) |
| `stage-card.tsx` (новый) | Карточка этапа (FR-9): метка типа, статус, сводка конфига, подпись правила, проблемы (FR-7), футер «Посев →» / «Настроить» / «Удалить» (FR-10) + слот действий «Сформировать»/«Расформировать» (FR-11). Одновременно `useDraggable` и `useDroppable` |
| `stage-inspector.tsx` (новый) | Панель справа (FR-18..FR-23): название, тип (read-only), конфиг, фиксация состава, правило отбора, футер |
| `schema-skeleton.tsx` (новый) | Скелетон в форме палитры + двух рядов уровней (FR-28) |
| `nomination-schema.tsx` (**не удаляется — исправлено после реализации**) | Изначально план предполагал удаление (ветка `mode="public"` считалась мёртвой). Разведка ошиблась: у неё есть живой потребитель, `widgets/nomination-pools-public/nomination-pools-public.tsx`. Файл восстановлен join-волной (T18) сразу после удаления, как только сборка вскрыла регрессию — остаётся как есть, `mode="admin"` просто больше не используется (мёртв, но не удалён — не в скоупе этой спеки). См. `docs/design-sync.md` |
| `nomination-schema.test.tsx` (не удаляется, по той же причине) | — |

`DndContext` живёт в корне экрана: `onDragEnd` разбирает бросок чистой
функцией (ниже) и вызывает соответствующую мутацию либо открывает диалог
создания с предзаполнением.

### `features/stage-management/`

- `api/requests.ts` — добавить `setStageStatusRequest(stageId, status)`
  (`POST /api/stages/[stageId]/status`).
- `api/use-set-stage-status.ts` (новый) — мутация фиксации состава (FR-22),
  инвалидирует `stageManagementKeys.list(nominationId)`. **Намеренный дубль**
  тонкого фетчера, уже существующего в `nomination-pools` и
  `bracket-seeding`: импорт соседней фичи запрещён правилом 6
  `web/AGENTS.md`, а дублирование тонкого фетчера — санкционированный
  FSD-выход (AC-20).
- `ui/create-stage-dialog.tsx` — становится **управляемым**: принимает
  `open`/`onOpenChange` и `prefill?: { type: StageTypeChoice; sourceStageId?: string }`;
  `DialogTrigger` — опциональный (виджет открывает диалог и по кнопке, и по
  броску, FR-13/FR-14). Поля и валидация не меняются.
- `ui/edit-stage-dialog.tsx` + тест (**удаляются**) — заменены инспектором
  (решение пользователя №1).
- `ui/stage-management.tsx` + тест (**удаляются**) — композиция переехала в
  виджет; вместе с файлом уходят четыре кросс-фичевых импорта.

### `features/nomination-management/`

- `api/use-nomination.ts` (новый) — `useQuery` на `GET /api/nominations/[id]`
  с `initialData` из server component: инлайн-правка (FR-2) должна видеть
  свежее значение после мутации, а списком номинаций этот экран не
  пользуется.
- `api/requests.ts` — добавить `getNominationRequest(id)`.
- `api/use-update-nomination.ts` — дополнительно инвалидировать ключ одной
  номинации (аддитивно, экран списка не ломается).
- `ui/nomination-inline-header.tsx` (новый) — инлайн-правка названия,
  вместимости и ссылки на регламент (FR-2/FR-3) + кнопка приёма заявок
  (FR-4). Гейт и перевод 409 — существующие `registration-gate.ts`
  (`canClose`/`canReopen`/`reopenBlockedReason`/`registrationErrorMessage`),
  переписывать не нужно. Правка каждого поля — отдельный `UpdateNomination`
  с текущими значениями остальных полей (ручка принимает объект целиком).

### `features/format-presets/`

- `ui/preset-chips.tsx` (новый) — чипы со «взводом» (FR-25) и инлайн-поле
  «Сохранить как пресет» (FR-26). Данные — `usePresets`, мутации —
  `useApplyFormat`/`useSavePreset` (без изменений), тексты отказов —
  существующий `presetErrorMessage(error, status)` (FR-27).
- `ui/apply-format-dialog.tsx`, `ui/save-preset-dialog.tsx` + их тесты
  (**удаляются**) — единственный их потребитель был `stage-management.tsx`.
  Вместе с `apply-format-dialog.tsx` уходит UI-путь «применить схему
  номинации-донора» (0020 FR-15) — принятое следствие решения пользователя
  №3; `useApplyFormat` и BFF-маршрут поддержку донора сохраняют.
- `ui/preset-library.tsx` (экран «Форматы», 0029) — **не трогается**.

### `entities/stage/lib/` — чистые функции (тестируются без рендера)

- `labels.ts` — добавить `stageConfigLabel(stage): string` («8 · бронза»,
  «4 гр.», «» для этапа без конфига) для FR-9. Существующие
  `stageRuleLabel`/`groupStagesByLevel`/`stageTypeLabel` переиспользуются
  как есть.
- `issues.ts` (новый) — `schemaIssueCounts(issues): { error, warning, info }`
  для строки диагностики (FR-6). Рядом уже живёт `schemaErrorCount` (0028) —
  его не дублируем, а выражаем через новую функцию либо оставляем как есть,
  решается при реализации без изменения поведения списка номинаций.
- `schema-drag.ts` (новый) — `resolveSchemaDrop(dragged, target)` →
  размеченное объединение намерений:
  `{ kind: "create-stage"; type; sourceStageId?: string }` (FR-13/FR-14) ·
  `{ kind: "set-roster-source"; stageId }` (FR-15) ·
  `{ kind: "set-stage-source"; stageId; sourceStageId }` (FR-16) ·
  `{ kind: "none" }` (бросок на себя, неизвестная пара). Вся семантика
  перетаскивания — здесь, компоненты только вызывают.

### Server components vs client

Страница — server component (SSR номинации и итогового протокола);
`NominationSchemaScreen` и всё под ним — `"use client"` (мутации, DnD,
выделение). Номинация приходит пропом и служит `initialData` для
`useNomination`.

### State

- server-state — TanStack Query (`useStages`, `useNomination`, `usePresets`);
- UI-state экрана (`selectedStageId`, `createPrefill`, `armedPresetId`,
  открытость инлайн-поля пресета, редактируемое поле шапки) — `useState` в
  виджете; zustand не нужен (состояние не пересекает границы экрана).

## События

> Placeholder. Event-Driven Design ещё не введён.

- Издаёт: нет
- Потребляет: нет

## Тестирование

> ADR 0003 (стратегия) + ADR 0009 (TDD-цикл). Сервер не меняется — Go-тестов
> и BFF e2e в этом инкременте нет.

- **Юнит (Vitest, чистые функции)**: `stageConfigLabel` (сетка с бронзой и
  без, группы с числом и без, этап без конфига); `schemaIssueCounts` (пусто,
  смешанные классы); `resolveSchemaDrop` (все четыре намерения + бросок
  карточки на себя + неизвестная пара).
- **Компонентные (Vitest + RTL)**:
  - `nomination-inline-header` — сохранение по Enter/blur, `Esc` откатывает,
    пустое название даёт инлайн-ошибку без запроса (AC-1), кнопка приёма по
    гейту и перевод 409 (AC-3);
  - `stage-inspector` — правка правила и «Очистить» (AC-11), блокировка
    селектора при ростере (AC-12), блокировка конфига непустым составом
    (AC-13), переключение фиксации (AC-14), удаление через `ConfirmDialog`
    (AC-15);
  - `stage-card` — сводка конфига и ссылка «Посев →» с верным `href` (AC-5/AC-6);
  - `schema-canvas` / `nomination-schema-screen` — подписи уровней (AC-5),
    пустое состояние с кнопками (AC-18), скелетон и ошибка с повтором
    (AC-19), броски палитры и карточек (AC-7..AC-10) — `@dnd-kit` мокается
    тем же приёмом, что в 0030 (`vi.mock("@dnd-kit/core", …)` с сохранением
    настоящих `useDroppable` у детей);
  - `preset-chips` — «взвод» в два клика (AC-16), инлайн-сохранение и 409
    (AC-17);
  - `schema-diagnostics` — «Схема корректна» и счётчики (AC-4).
- **Границы слоёв (AC-20)**: после удаления `stage-management.tsx` в
  `features/**` не остаётся импортов вида `@/features/<другая фича>` —
  проверяется grep'ом в задаче верификации (отдельного линт-правила в
  проекте нет).
- Скриншотных тестов нет (ADR 0003).

## Риски и открытые вопросы

- **Тесты DnD.** `@dnd-kit` в jsdom не воспроизводит настоящий pointer-drag;
  как и в 0030, тестируется разбор броска (чистая функция) плюс вызов
  `onDragEnd` через мок контекста. Реальное перетаскивание проверяется
  ручным смоуком.
- **Инлайн-правка шапки против канона модалок.** FR-2 — сознательное
  отступление (решение пользователя №2). Риск — расхождение поведения с
  модалкой правки в списке номинаций (там же правится описание, которого в
  шапке нет): инлайн-шапка правит **три** поля, отправляя остальные без
  изменений; при реализации проверить, что описание не затирается.
- **Вторая точка входа в фиксацию состава** (FR-22, решение пользователя
  №4): статус этапа теперь меняется с двух экранов. Инвалидация ключей
  должна покрывать оба — список этапов номинации и раскладку этапа.
- **Потеря UI-пути «схема номинации-донора»** (0020 FR-15) — принятое
  следствие решения №3. Зафиксировать в `docs/specs/README.md` и
  `docs/design-sync.md`, чтобы функциональность не считалась утраченной
  случайно.
- **Объём экрана.** Самый большой из экранных инкрементов очереди: палитра +
  холст + инспектор + шапка + тулбар. Работа разбивается на дизъюнктные
  треки (см. `tasks.md`), сборка — join-волной.
- **Судьба `mode="public"`.** Удаляем вместе со старым виджетом; если 0035
  захочет read-only проекцию, она собирается из `stage-card.tsx` — отметить
  в `docs/design-sync.md` при обновлении карты.

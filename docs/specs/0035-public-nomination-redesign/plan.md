# Plan: Редизайн публичной страницы номинации — схема, группы, плейофф

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-08-22
- Спека: `./spec.md`

## Обзор решения

Чистый web-инкремент: ни proto, ни сервера, ни миграций — всё, что рисует
дизайн, уже едет в `NominationLiveSnapshotDto` (0014/0017/0018/0021).
`app/nominations/[id]/page.tsx` сужается до серверной обёртки (SSR-снапшот
+ `notFound()`), композиция переезжает в новый виджет
`widgets/nomination-public/`, где живут шапка с живым положением, цепочка
схемы, карточки групп, секции сеток и блоки-обещания. Двухрежимный
`widgets/nomination-schema/nomination-schema.tsx` удаляется вместе с пропом
`mode` (spec, «Принятые решения», п.1), `widgets/nomination-pools-public/`
— тоже (его роль забирает новый виджет). Вся производная логика (положение
номинации, элементы цепочки схемы, подпись счёта) выносится чистыми
функциями в `entities/*`, виджеты остаются отображением (NFR-5).

## Контракты (proto)

Изменений нет. Проверено при разведке 2026-08-22: шапка, цепочка схемы,
группы, сетки, блоки-обещания и итоги полностью покрываются существующим
`NominationLiveSnapshotDto` (`stages` со статусом и конфигурацией, `pools`
с составом/боями/площадкой/таблицей, `brackets` с кругами, половинами,
`thirdPlace`, `champion`/`thirdPlaceWinner`, `results`) плюс
`GetNomination` (название, описание, статус приёма заявок).

Осознанно **не** добавляем (spec, «Вне скоупа»): `serverNowUnixMs` в снапшот
номинации, время боёв, таймер.

## Server (модули и слои)

Изменений нет. Ни новых RPC, ни миграций, ни правок `modules/stage`.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

### BFF

Изменений нет — страница читает публичные gRPC напрямую в SSR
(`entities/nomination/model/get-nomination.ts`,
`entities/nomination-live/model/get-nomination-live.ts`), живой канал —
существующий `features/nomination-live/api/use-nomination-live.ts`
(SSE + polling-fallback).

### entities (чистые функции, юнит-тестируемые без DOM)

- `entities/nomination-live/lib/position.ts` **(новый)** —
  `nominationPosition(snapshot): { phase: "upcoming" | "running" | "finished"; stageTitle: string }`
  для FR-3/FR-4: фаза выводится из статусов этапов и состояний боёв
  снапшота (идёт — есть бой `IN_PROGRESS` либо пул/половина `ACTIVE`;
  завершена — все секции доиграны, как это уже считает `results`;
  иначе — не начата). Подпись — название текущего (или последнего
  завершённого) этапа. Никакого нового поля в контракте.
- `entities/stage/lib/schema-chain.ts` **(новый)** —
  `schemaChain(stages, snapshot): SchemaChainItem[]` для FR-5/FR-6/FR-9:
  порядок из существующего `groupStagesByLevel` (уровни сохраняются —
  параллельные этапы попадают в один элемент цепочки), на каждый этап —
  `title`, `configLabel` (уже есть `stageConfigLabel`), `state`
  (`finished` | `running` | `pending`) и `waitingHint` («ждёт результаты
  <источник>», строится из `stageRuleLabel`/названия этапа-источника).
  Диагностика (`issues`) и правила посева сюда не попадают (FR-7).
- `entities/pool/lib/types.ts` — добавить `boutScoreLabel(bout): string`
  (FR-13): `—:—` для `BOUT_STATE_PENDING`/не начатого, `A:B` иначе.
  Аддитивно, рядом с существующими `boutStateLabel`/`outcomeOf`.
- `entities/bracket/lib/types.ts` — добавить `bracketFinalRounds(bracket):
  { final: BracketRound | null; thirdPlace: BracketRound | null }` (FR-18):
  финал — последний круг без `thirdPlace`, бой за 3-е место — круг с
  `thirdPlace = true`. Чистый разбор уже приходящей структуры.

### widgets/nomination-public (новый срез, композиция экрана)

- `nomination-public-screen.tsx` — клиентская композиция (NFR-2): держит
  единственный `useNominationLive(nominationId, initialSnapshot)` и
  раскладывает блоки в порядке дизайна: шапка → итоги (`NominationResults`,
  FR-22) → цепочка схемы → секции этапов (группы / сетка / обещание) .
- `nomination-header.tsx` — FR-1/FR-2/FR-3: заголовок, описание, ссылка «На
  главную», плашка статуса приёма (`nominationStatusLabel`, 0012) и отметка
  положения из `nominationPosition`. Принимает `nomination` пропом от
  серверной обёртки, живую часть — из снапшота.
- `schema-chain.tsx` — FR-5..FR-9: горизонтальная цепочка `SchemaChainItem`
  со стрелками между уровнями, живой маркер у `running`, пунктирный стиль и
  подпись ожидания у `pending`. Прокрутка внутри блока на узком экране
  (NFR-3).
- `pool-card.tsx` — FR-10..FR-14: карточка группы (шапка со счётчиком,
  площадкой/«площадка не назначена» и статусом; разделы «Состав», «Бои»,
  «Таблица» через существующий `entities/pool/ui/pool-standings-table`).
- `bout-row.tsx` — строка боя: номер, пара, `boutScoreLabel`, состояние,
  исход завершённого, выделение текущего (FR-13/FR-14).
- `stage-section.tsx` — секция одного этапа: подпись этапа + либо сетка
  групп (`pool-card`), либо `BracketView`, либо блок-обещание
  `stage-promise.tsx` (FR-21).
- `stage-promise.tsx` — FR-21: название, конфигурация, подпись «сформируется
  по результатам <этап>».
- `empty-layout.tsx` — FR-23: оформленное пустое состояние на
  `shared/ui/empty-state.tsx` вместо сегодняшнего голого абзаца.

### widgets/bracket-view (правки общего виджета, spec п.2 решений)

- FR-17: на паре, чей бой идёт, — подпись площадки (берётся из
  `half.container.arenaName`, уже приходит) рядом с живым маркером.
- FR-18: финал и бой за 3-е место (через `bracketFinalRounds`) рендерятся
  выделенными блоками правого края сетки; остальные круги — как сейчас.
- FR-13 применяется и здесь: счёт неначатой пары — `boutScoreLabel`.
- FR-16/FR-19/FR-20 уже выполнены (0018/0032) — регресс закрывается
  существующими тестами `bracket-view.test.tsx`.

### Удаления

- `widgets/nomination-pools-public/nomination-pools-public.tsx` + тест —
  роль переходит к `widgets/nomination-public/`.
- `widgets/nomination-schema/nomination-schema.tsx` + тест — у виджета не
  остаётся потребителей (проверено grep'ом: единственный импорт — в
  удаляемом `nomination-pools-public.tsx`); тип `NominationSchemaMode`
  исчезает вместе с файлом. `widgets/nomination-schema/` остаётся
  админским срезом 0031 (`nomination-schema-screen` и его части).

### Страница

- `app/nominations/[id]/page.tsx` — тонкая серверная обёртка (NFR-2):
  `getNomination` → `notFound()`, `getNominationLive` → рендер
  `NominationPublicScreen` с `nomination` и `initialSnapshot`. SSR остаётся
  единственным источником первого экрана (NFR-1).

### Server components vs client

Страница — server component (SSR-снапшот, NFR-1); `NominationPublicScreen` и
всё под ним — client (одна подписка `useNominationLive`, FR-24).

### State

Server-state — TanStack Query внутри `useNominationLive` (существующий);
своего Zustand-стора экран не заводит; локального UI-состояния (фильтров,
табов) в дизайне нет.

## События

Placeholder — фиче доменные события не нужны, изменений в существующем
живом канале (ADR 0011/0012) нет.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- Юнит (Vitest, без DOM): `entities/nomination-live/lib/position.test.ts`
  (три фазы + подпись этапа + номинация без этапов),
  `entities/stage/lib/schema-chain.test.ts` (порядок, параллельные этапы
  одного уровня, `pending`-подпись, отсутствие правил/диагностики в выводе),
  `entities/pool/lib/types.test.ts` (+`boutScoreLabel`),
  `entities/bracket/lib/types.test.ts` (+`bracketFinalRounds`, сетка с боем
  за 3-е место и без него).
- Web-компоненты (Vitest + Testing Library): по тесту на каждый новый файл
  `widgets/nomination-public/*` — AC-1..AC-14, AC-18 (прокрутка — проверка
  класса-контейнера, как в существующем `bracket-view.test.tsx`);
  обновление `widgets/bracket-view/bracket-view.test.tsx` под FR-17/FR-18.
- Живость (AC-15/AC-16) закрыта существующими тестами
  `features/nomination-live/api/use-nomination-live.test.ts` — новый экран
  их не дублирует, но `nomination-public-screen.test.tsx` проверяет, что
  подписка одна и снапшот-проп доходит до блоков.
- Server/Go — не затрагивается; `make test` гоняется как регресс.

## Риски и открытые вопросы

- **Правка общего `BracketView` задевает страницу этапа (0032).** Осознанно
  (spec, решение п.2); страхует существующий набор тестов виджета —
  выделение финала и площадка на идущей паре добавляются аддитивно, старые
  ожидания не переписываются без причины.
- **`nominationPosition` дублирует смысл `LiveNominationDto.phase`
  (0034, серверный расчёт по турниру).** Одинаковую фазу считают в двух
  местах: сервер — для сайдбара главной, клиент — для шапки одной
  номинации. Тащить турнирный агрегат на страницу номинации ради подписи
  дороже; если расхождение подписей начнёт мешать, следующий инкремент
  сведёт их в одно место (кандидат — поле в снапшоте номинации).
- **Цепочка схемы на широких форматах** (5+ этапов, параллельные ветки) —
  горизонтальная прокрутка внутри блока; если станет нечитаемой, запасной
  вариант — перенос на вторую строку, решается при реализации без правки
  спеки.

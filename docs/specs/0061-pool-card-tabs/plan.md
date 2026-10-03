# Plan: Вкладки «Бои / Рейтинг» в карточке группы

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта.

- Статус: done
- Дата: 2026-10-03
- Спека: `./spec.md`

## Обзор решения

Изменение только в web. Общий компонент `PoolResultsTabs` в `entities/pool/ui`
оборачивает существующие `BoutRow` и `PoolStandingsTable` в `shared/ui/tabs`
(Radix Tabs). Им пользуются и админская карточка (`features/nomination-pools`),
и публичная (`widgets/nomination-public/pool-card`). Так компонент живёт там
же, где и обе его части, и FSD не нарушается: `features` не импортирует
`widgets`. Тот же приём уже применён к `BoutRow` и `PoolStandingsTable`
(0016/0051). Начальная вкладка вычисляется чистой функцией из статуса группы.
Выбор пользователя хранится в локальном `useState` карточки.

## Контракты (proto)

Не меняются. Всё нужное уже есть в `LivePoolDto` живого снапшота:
`pool.status`, `pool.members`, `pool.standings`, `bouts`, `currentBoutId`.

## Server (модули и слои)

Не меняется.

## Web (FSD + BFF)

- BFF: без изменений.
- `entities/pool/lib/pool-tab.ts` (новый):
  - `type PoolTab = "bouts" | "standings"`;
  - `defaultPoolTab(status: PoolStatus): PoolTab` — `"bouts"` только для
    `POOL_STATUS_ACTIVE`, для всех остальных статусов (`NOT_READY`, `READY`,
    `PREPARING`, `FINISHED`, `UNSPECIFIED`) — `"standings"` (FR-4).
- `entities/pool/ui/pool-results-tabs.tsx` (новый, `"use client"`):
  - пропсы: `status`, `members: FighterRef[]`, `standings: PoolStanding[]`,
    `bouts: BoardBout[]`, `currentBoutId: string`;
  - состояние: `const [chosen, setChosen] = useState<PoolTab | null>(null)`;
    активная вкладка — `chosen ?? defaultPoolTab(status)`. Пока пользователь
    не выбирал, вкладка следует за живым статусом (FR-4a, AC-6). После первого
    `onValueChange` фиксируется выбор пользователя (AC-7). Без `useEffect`:
    вычисление в рендере, лишних перерисовок нет;
  - `Tabs` контролируемый (`value`/`onValueChange`), `TabsList` с триггерами
    «Бои · N» и «Рейтинг». Использовать вариант `TabsList`, который помещается
    в 360 px карточки (FR-7);
  - «Бои» — список `BoutRow` с `isCurrent` (перенос `BoutList` из админки);
  - «Рейтинг» — `PoolStandingsTable`, если `standings.length > 0`; иначе
    список `members` (имя + клуб, без мест) и подпись «Итогов пока нет»
    (FR-3a). Компонент `PoolStandingsTable` не меняется;
  - условие показа вкладок (`bouts.length > 0`) решает вызывающий код, сам
    компонент всегда рисует вкладки.
- `features/nomination-pools/ui/nomination-pools.tsx`:
  - `PoolColumn` получает живой `status`
    (`liveByPoolId.get(pool.id)?.pool.status ?? pool.status`), проброс как
    у `standings`;
  - если `readOnly && bouts.length > 0`: вместо зоны состава
    (`FighterCard`-список в droppable) и пары `BoutList` + `PoolStandingsTable`
    — `PoolResultsTabs` (FR-3b). Шапка (название, счётчик, «готовится к
    запуску») остаётся;
  - иначе — как сейчас (FR-5; черновик и момент до прихода живого снапшота).
    `useDroppable` вызывается безусловно, как и раньше (правила хуков);
    `disabled: readOnly` уже исключает drop;
  - локальный `BoutList` удаляется, если у него не остаётся вызывающих.
- `widgets/nomination-public/pool-card.tsx`:
  - если `bouts.length > 0`: шапка + `PoolResultsTabs`, раздел «Состав» не
    рендерится (FR-3b);
  - иначе — шапка + «Состав», как сейчас (FR-5);
  - обновить JSDoc (сейчас перечисляет три раздела).
- Server/client: обе карточки уже клиентские, их родители владеют живой
  подпиской (`StagePageScreen`, публичный экран). Новых подписок нет (NFR-1).
- State: UI-состояние вкладки — локальный `useState` в карточке (ADR 0006:
  local → useState). Zustand и `localStorage` не нужны.

## События

- Издаёт: нет
- Потребляет: нет

## Тестирование

- Юнит (Vitest): `entities/pool/lib/pool-tab.test.ts` — таблица всех
  `PoolStatus` → вкладка.
- Компонент (Vitest + Testing Library, jsdom):
  `entities/pool/ui/pool-results-tabs.test.tsx`:
  - ACTIVE → выбраны «Бои», таблицы нет; переключение на «Рейтинг» скрывает
    бои (AC-1/AC-2). Radix переключает по `mousedown`: использовать тот же
    приём, что в `console-screen.test.tsx`;
  - READY без итогов → «Рейтинг» со списком бойцов и «Итогов пока нет»,
    без колонки мест (AC-3);
  - FINISHED → «Рейтинг» с таблицей (AC-5);
  - `rerender` со сменой статуса READY → ACTIVE → FINISHED без действий
    пользователя → вкладка следует за статусом (AC-6);
  - ручной выбор, затем `rerender` со сменой статуса и новыми `standings` →
    вкладка сохраняется, таблица обновлена (AC-4/AC-7);
  - роли `tablist`/`tab`/`tabpanel` и `aria-selected` (FR-7).
- `features/nomination-pools/ui/nomination-pools.test.tsx`: readOnly с
  живыми боями → вкладки, без отдельного состава; черновик → DnD-зона без
  вкладок (AC-8); статус берётся из живого пула.
- `widgets/nomination-public/pool-card.test.tsx`: с боями → вкладки, без
  «Состав»; без боёв → «Состав», без вкладок. Существующие AC-7 0035 и
  проверки 0051 обновить под новую компоновку, не удалять.
- AC-10 (нет запросов при переключении) обеспечивается конструкцией: компонент
  не принимает хуков данных. Проверяется ревью и ручной приёмкой (вкладка
  Network).
- Ручная приёмка: 360/390 px, клавиатура, тёмная тема; живой бой на двух
  клиентах (admin + public) с переключениями; обрыв канала (SF-QA-05).

## Риски и открытые вопросы

- Владение файлами: по `docs/implementation/2026-09-feedback/waves.md`
  S-GROUPS входит в UI-чат волны 2 вместе с S-POOL/S-CAPACITY/S-RESULTS.
  `nomination-pools.tsx` и `pool-card.tsx` не должны параллельно правиться
  другим треком (0054 владеет stage-build, не этими файлами).
- Длинный список бойцов в шапке `TabsList` не участвует — переполнение
  возможно только у подписей вкладок; держать их короткими.
- Если живой пул ещё не пришёл, а раскладка уже `ready`, админская карточка
  кратко покажет прежний вид (состав без вкладок). Это допустимо (FR-5) и
  совпадает с текущим поведением 0051.

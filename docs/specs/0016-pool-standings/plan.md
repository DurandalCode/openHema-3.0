# Plan: Статистика и итоговая таблица пула (pool standings)

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-08-02
- Спека: `./spec.md`

## Обзор решения

Итоговая таблица — чистая производная существующих данных, без новой
персистентности: состав пула (`Pool.Members`) и его бои
(`BoutConductor.BoutsByPool`, уже отдаёт `FighterA`/`FighterB`/`State`/
`ScoreA`/`ScoreB` — всё нужное). Статистика/место считаются заново при
каждом чтении новой чистой функцией `domain.ComputeStandings` (по аналогии с
уже существующей `domain.ComputePoolStatus`, спека 0011) — никакого нового
хранилища, миграции, кросс-модульного порта. Наружу — новое поле
`standings` в уже существующем proto-сообщении `Pool`, заполняется только в
двух путях чтения: «страница управления пулом» (`GetLayout`, автоматически и
`ListPublicPools`, т.к. переиспользует ту же сборку) и «публичный живой
снапшот номинации» (`NominationLive`/`WatchNominationLive`, спека 0014).
Пути, связанные с ареной/табло (`GetPoolsForArena`, `GetBoutBoard`,
`ArenaLiveSnapshot`), поле не заполняют — итоговые таблицы на табло уже
осознанно оставлены вне скоупа спекой 0015.

## Контракты (proto)

- Файл: `proto/hema/v1/pool.proto`
- Сервисы/RPC не меняются — новых RPC нет, только новое поле в уже
  возвращаемом сообщении.
- Новое сообщение `PoolStanding` — одна строка итоговой таблицы пула:
  ```proto
  message PoolStanding {
    FighterRef fighter = 1;
    int32 wins = 2;
    int32 draws = 3;
    int32 losses = 4;
    int32 points_scored = 5;
    int32 points_conceded = 6;
    int32 place = 7;
  }
  ```
  `place` — итоговое место с учётом дележа (спека FR-3: 1, 2, 2, 4), считается
  сервером — клиент не пересчитывает и не досортировывает (FR-8).
- Изменённое сообщение `Pool` — новое поле после существующего `nomination_name = 9`:
  ```proto
  message Pool {
    ...
    string nomination_name = 9;
    // standings — итоговая таблица пула (спека 0016, FR-1..FR-4). Пусто, если
    // в пуле нет ни одного завершённого боя (FR-7) — так UI отличает «нечего
    // показывать» от «все места нулевые».
    repeated PoolStanding standings = 10;
  }
  ```

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

- Модуль: `modules/pool/` — расширение существующего, новый модуль не заводим.
- PG-схема: без изменений — фича не хранит собственных данных.
- Слои:
  - `domain/` (`modules/pool/domain/standings.go`, новый файл — по образцу
    `distribute.go`):
    - `type Standing struct { Fighter FighterRef; Wins, Draws, Losses, PointsScored, PointsConceded, Place int }`.
    - `func ComputeStandings(members []FighterRef, bouts []BoutRef) []Standing` —
      чистая функция. Логика: инициализировать нулевую статистику по всем
      `members`; пройти по `bouts`, учитывая только `State == BoutStateFinished`
      (FR-1); для каждого учтённого боя сравнить `ScoreA`/`ScoreB` (равенство —
      ничья, FR-4) и обновить `Wins`/`Draws`/`Losses`/`PointsScored`/
      `PointsConceded` обоих участников; если учтённых боёв не было —
      вернуть пустой срез (вызывающий код тогда не заполняет `Pool.Standings`,
      реализуя FR-7); иначе отсортировать по FR-2 (`Wins` убыв. →
      `PointsScored` убыв. → `PointsConceded` возр.) и проставить `Place` по
      правилу конкурентного ранжирования (FR-3: полностью равные по всем трём
      критериям делят место, следующий получает место `+ размер группы`).
    - `modules/pool/domain/domain.go`: добавить поле `Standings []Standing` в
      `type Pool struct` (рядом с существующими `Members`/`Status`/...).
  - `service/` (`modules/pool/service/service.go`, правки существующих
    методов, без новых публичных методов):
    - `applyArenaAndStatus` (используется `loadLayout` → `GetLayout` (FR-5) и,
      транзитивно, `ListPublicPools`): после вычисления `finished` через уже
      имеющийся `s.bouts.PoolProgress`, если `finished > 0` — дополнительно
      `bouts, _ := s.bouts.BoutsByPool(ctx, pools[i].ID)` и
      `pools[i].Standings = domain.ComputeStandings(pools[i].Members, bouts)`.
      Вызов `BoutsByPool` — только когда есть смысл (при `finished == 0` пул
      либо ещё не начат, либо ещё нет ни одного результата — таблицу всё
      равно не показываем, FR-7), не на каждый draft-пул номинации.
    - `NominationLive` (спека 0014, публичный живой снапшот): уже вызывает
      `s.bouts.BoutsByPool(ctx, pool.ID)` для сборки `LivePool.Bouts` —
      переиспользовать этот срез: `pool.Standings =
      domain.ComputeStandings(pool.Members, sorted)` перед добавлением в
      `livePools`. Ноль дополнительных вызовов портов.
    - `enrichPools`, `GetPoolsForArena`, `boardForPool`/`GetBoutBoard`,
      `ArenaLiveSnapshot`-сборка — **не трогаем**: `Standings` там осознанно
      не заполняется (вне скоупа арены/табло, см. «Обзор решения»).
  - `repo/` — без изменений (нет новых запросов, `BoutConductor` уже
    предоставляет всё нужное через существующий `BoutsByPool`).
  - `api/` (`modules/pool/api/handler.go`):
    - Новая функция `toProtoStandings(s []domain.Standing) []*hemav1.PoolStanding`
      (по образцу `toProtoFighterRefs`), маппит `Fighter`→`FighterRef`
      (переиспользует существующий `toProtoFighterRefs`/аналогичный маппинг
      одного `FighterRef`) и остальные поля один в один.
    - `toProtoPool` — добавить `Standings: toProtoStandings(p.Standings)`.
    - `toProtoLivePool` — не требует правок: `LivePool.Pool` собирается через
      тот же `toProtoPool`.
  - `migrations/` — нет новых миграций.
- Регистрация: без изменений (`module.go`/`internal/platform` не трогаем —
  ни новых зависимостей, ни новых портов).
- Межмодульные зависимости: без изменений. `BoutConductor.BoutsByPool` уже
  возвращает всё необходимое (`FighterA`/`FighterB`/`State`/`ScoreA`/
  `ScoreB`) — новых методов порта `pool → bout` не требуется.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

- BFF (Route Handlers, Node runtime): без новых роутов. Существующие
  `app/api/nominations/[id]/pool-layout/route.ts`,
  `app/api/nominations/[id]/public-pools/route.ts`,
  `app/api/nominations/[id]/live-snapshot/route.ts`,
  `app/api/nominations/[id]/live/route.ts` (SSE) уже проксируют `Pool`/
  `LivePool` целиком — новое поле проходит через них без изменения роутов.
- Слои:
  - `lib/grpc/serialize.ts`: `poolRawToDto` сейчас перечисляет поля `Pool`
    явно (не голый `toJson`-passthrough) — добавить
    `standings: (raw?.standings ?? []) as PoolStanding[]` (proto `int32`/
    `FighterRef` поля `PoolStanding` сериализуются `toJson` уже в camelCase,
    маппинг 1:1, доп. функция не нужна).
  - `entities/pool/lib/types.ts`: добавить тип
    `export type PoolStanding = { fighter: FighterRef; wins: number; draws: number; losses: number; pointsScored: number; pointsConceded: number; place: number }`
    и поле `standings: PoolStanding[]` в `Pool`. Данные уже отсортированы и
    имеют готовый `place` от сервера (FR-8) — клиентской пересортировки не
    пишем.
  - `entities/pool/ui/pool-standings-table.tsx` (новый файл): presentational
    client-компонент — таблица «место / боец / победы / ничьи / поражения /
    очки набранные / очки пропущенные», рендерит `null`, если
    `standings.length === 0` (FR-7). Лежит в `entities/pool/ui/`, а не в
    `features/nomination-pools/ui/`, т.к. переиспользуется и admin-фичей
    (`features/nomination-pools`), и public-виджетом
    (`widgets/nomination-pools-public`) — по FSD-границам (`app → widgets →
    features → entities → shared`, `features` друг друга не импортят) общий
    UI на этом уровне может жить только в `entities` или `shared`; здесь
    уместнее `entities/pool` — компонент завязан на доменный тип `Pool`.
  - `features/nomination-pools/ui/nomination-pools.tsx`: рендерит
    `<PoolStandingsTable standings={pool.standings} />` под каждым пулом
    (та же карточка, где уже показан состав/статус).
  - `widgets/nomination-pools-public/nomination-pools-public.tsx`: рендерит
    тот же `<PoolStandingsTable standings={pool.standings} />` для
    `livePool.pool.standings`.
- Server components vs client: `pool-standings-table.tsx` — client (рендерится
  внутри уже клиентских `nomination-pools.tsx`/`nomination-pools-public.tsx`),
  без собственного состояния — чистое отображение пропсов.
- State: новых источников server-state нет — `standings` приходит внутри уже
  существующих RQ-хука `useLayout` (admin) и SSE-снапшота `useNominationLive`
  (public, спека 0014); Zustand/useState не требуются.

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей).

- Издаёт: нет.
- Потребляет: нет.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- Юнит (`modules/pool/domain/standings_test.go`, без fake-портов — чистая
  функция): пустой список боёв → пустой результат (FR-7); один завершённый
  бой (победа/поражение) → корректные `wins`/`losses`/очки у обоих участников
  (AC-2); ничья → `draws` у обоих, не `wins`/`losses` (AC-4, FR-4); полный
  раунд-робин из 4 бойцов с разными исходами → верный порядок по тай-брейку
  победы→очки→пропущенные (AC-1, FR-2); два бойца, полностью равные по всем
  трём критериям → одинаковое `place`, следующий получает `place` со сдвигом
  на размер группы, т.е. 1,2,2,4 (AC-3, FR-3); незавершённые (не начатые/
  идущие) бои не влияют на статистику (FR-1).
- Юнит (`modules/pool/service/service_test.go`, расширение существующих
  тестов с fake `BoutConductor`): `GetLayout` и `NominationLive` возвращают
  заполненный `Pool.Standings`, когда у пула есть завершённые бои, и пустой —
  когда завершённых боёв нет (AC-2/AC-6); повторное открытие/правка
  завершённого боя (`Reopen`→`Score`→`Finish` через fake) меняет результат
  следующего чтения таблицы без отдельного действия (AC-5, FR-8).
- E2E ручек (`modules/pool/api/handler_test.go`, httptest + Connect,
  fake-порты): `GetLayout`, `ListPublicPools`, `GetNominationLive` отдают
  `standings` в ответе после завершения боя через fake `BoutConductor`;
  `GetPoolsForArena`/`GetBoutBoard` — регрессионно проверить, что `standings`
  остаётся пустым (поле осознанно не заполняется на этих путях).
- Web (Vitest):
  - `lib/grpc/serialize.ts` — тест на проброс `standings` из proto-ответа в
    JSON (по образцу существующих `*.e2e.test.ts` для `poolToJson`).
  - `entities/pool/ui/pool-standings-table.test.tsx` — рендерит строки в
    переданном порядке (без пересортировки), скрывается при пустом массиве.

## Риски и открытые вопросы

- Дополнительный вызов `BoutsByPool` в `applyArenaAndStatus` при `finished >
  0` — ещё один N+1-паттерн относительно числа пулов номинации, как и уже
  существующий `PoolProgress`; для типичных объёмов турнира (единицы-десятки
  пулов) не критично. Если станет узким местом — объединение
  `PoolProgress`+`BoutsByPool` в один метод порта (`BoutConductor`) — рефактор
  за рамками этой фичи, т.к. трогает уже стабильный интерфейс спеки 0013.
- Правило дележа мест (конкурентное ранжирование 1,2,2,4, FR-3) — стандартная
  спортивная практика, но если секретарям на практике будет удобнее другой
  вариант (например, «1,2,2,3»), потребуется отдельное уточнение — в этом
  инкременте фиксируем 1,2,2,4 как явно согласованное решение.

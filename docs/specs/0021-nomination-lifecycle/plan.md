# Plan: ЖЦ номинации целиком — статусы, итоговый протокол, призёры

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-08-10
- Спека: `./spec.md`
- Решение: `docs/adr/0014-nomination-format-stages.md` (инкремент 0021)

## Обзор решения

Инкремент почти целиком **вычислительный**: и статусы, и протокол — чистые
функции над уже загружаемыми данными, по образцу `ComputeStandings` (0016),
`ResolveBracket` (0018) и `ComputeOverallOrder` (0019). Новых сущностей нет,
хранилище модуля `stage` не меняется вовсе.

Три части:

1. **Статус этапа** (spec FR-1..FR-3) — новая чистая функция
   `ComputeStageStatus` в `stage/domain`: `draft`/`ready` берутся из хранимого
   `LayoutStatus`, `active`/`finished` выводятся из статусов контейнеров боёв,
   которые сервис и так считает (`ComputePoolStatus` / `computeHalfStatus`).
   На проводе — новое поле `Stage.execution_status` (вычисляемое, read-only).
2. **Статус номинации** (FR-4..FR-8) — модуль `nomination` получает **вторую
   ось** состояния: колонка `execution_state` (`none`/`active`/`finished`)
   рядом с существующим `status` (приём заявок, 0012). Публичный
   `NominationStatus` **вычисляется**: исполнительная ось вытесняет
   регистрационную, когда она не `none` (spec NFR-4). Значение пушит модуль
   `stage` через уже существующий порт `NominationProvider` — тем же приёмом
   «триггер по результирующему состоянию, не по имени RPC» (0012, FR-10),
   только теперь порт передаёт оба факта разом.
3. **Протокол** (FR-9..FR-19) — `domain/results.go` в модуле `stage`:
   терминальные этапы, места сетки по кругу выбывания, места группового этапа
   из сводного порядка. Отдаётся двумя путями: полем `results` в живом
   снапшоте номинации (0014 — публичная страница обновляется без перезагрузки)
   и отдельным unary `GetNominationResults` (админский экран схемы, где живой
   канал не нужен).

Модули `bout`, `arena`, `fighter`, `application`, `tournament` не меняются.
Миграция — одна, в модуле `nomination`.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

### `proto/hema/v1/stage.proto`

**Новый enum** (переиспользовать `PoolLayoutStatus` нельзя: значения 3/4
объявлены `reserved` спекой 0011 — вернуть их запрещает buf breaking):

```proto
// StageStatus — статус этапа целиком (спека 0021, FR-1; ADR 0014 §2):
// draft/ready — хранимая фиксация состава (0017), active/finished —
// вычисляются из прогресса боёв этапа, как PoolStatus у контейнера
// (0011/0013). Read-only: клиент не присылает это значение.
enum StageStatus {
  STAGE_STATUS_UNSPECIFIED = 0;
  STAGE_STATUS_DRAFT = 1;
  STAGE_STATUS_READY = 2;
  STAGE_STATUS_ACTIVE = 3;
  STAGE_STATUS_FINISHED = 4;
}
```

**`Stage`** — новое поле (существующее `status` типа `PoolLayoutStatus`
остаётся как есть: это хранимая фиксация, её присылают в `SetLayoutStatus`):

```proto
  // execution_status — вычисляемый статус этапа целиком (спека 0021, FR-1).
  StageStatus execution_status = 10;
```

**Протокол** — новые сообщения:

```proto
// NominationResultEntry — строка итогового протокола (спека 0021, FR-13).
// Место — диапазон «от–до» (FR-11): 1, 2, 3-4, 5-8. Одиночное место —
// place_from == place_to; клиент форматирует «5–8» сам и ничего не
// пересчитывает. Дальше — боец с именем/клубом (0007) и происхождение места
// человеческими словами: «выбыл в 1/4 финала», «Группа 2, место 1».
message NominationResultEntry {
  int32 place_from = 1;
  int32 place_to = 2;
  FighterRef fighter = 3;
  string origin_label = 4;
}

// NominationResultsSection — пьедестал одного терминального этапа (FR-9,
// FR-10). finished = false ⇒ entries пуст: пока этап не доигран, мест нет
// (FR-15), а сама секция нужна админке, чтобы показать «этап не доигран»
// (FR-19). places_from_overall_order = true у группового этапа больше чем на
// одну группу — интерфейс обязан показать оговорку про сведение без
// нормировки (FR-12, 0019 NFR-2).
message NominationResultsSection {
  string stage_id = 1;
  string stage_title = 2;
  StageType stage_type = 3;
  bool finished = 4;
  repeated NominationResultEntry entries = 5;
  bool places_from_overall_order = 6;
}

// NominationResults — итоговый протокол номинации (спека 0021): секция на
// каждый терминальный этап, у каждой свой пьедестал (FR-10). Сквозной
// нумерации мест по номинации нет.
message NominationResults {
  string nomination_id = 1;
  bool nomination_finished = 2;
  repeated NominationResultsSection sections = 3;
}
```

**`NominationLiveSnapshot`** — новое поле `NominationResults results = 5;`
(FR-18: итоги идут тем же живым каналом, что пулы и бои).

**`StagePublicService`** — новый RPC (публичный, без токена — как остальные
RPC этого сервиса; добавить в `publicProcedures` интерсептора `Auth`):

```proto
  // GetNominationResults возвращает итоговый протокол номинации (спека 0021,
  // FR-9..FR-15). Отдельно от GetNominationLive — для экранов, которым нужны
  // только итоги (админский экран схемы, FR-19).
  rpc GetNominationResults(GetNominationResultsRequest) returns (GetNominationResultsResponse);
```

с парой `GetNominationResultsRequest { string nomination_id = 1; }` /
`GetNominationResultsResponse { NominationResults results = 1; }`.

### `proto/hema/v1/nomination.proto`

**Изменений в схеме нет** — `NOMINATION_STATUS_ACTIVE`/`FINISHED` заведены
0012 и теперь просто начинают назначаться. Правится только комментарий у
enum `NominationStatus`: убрать «в этом инкременте не реализуются, не
назначаются», описать вывод из статусов этапов (FR-4) и то, что
исполнительная ось вытесняет регистрационную (NFR-4).

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

### Модуль `stage` — расширение (без миграций)

- `domain/results.go` (**новый файл**) — чистые функции и типы протокола:
  - `type ResultEntry struct { PlaceFrom, PlaceTo int; Fighter FighterRef; OriginLabel string }`
    (FR-11: место — диапазон; одиночное — `PlaceFrom == PlaceTo`);
  - `type ResultsSection struct { StageID, StageTitle string; StageType StageType; Finished bool; Entries []ResultEntry; PlacesFromOverallOrder bool }`;
  - `type NominationResults struct { NominationID string; Finished bool; Sections []ResultsSection }`;
  - `TerminalStages(stages []Stage) []Stage` — этапы, чей `ID` не встречается
    в `Rule.SourceStageID` ни у одного другого этапа (FR-9; то же отношение,
    что уже охраняет `ErrStageIsSource`, 0019 FR-7a);
  - `ComputeBracketPlaces(view BracketView) []ResultEntry` (FR-11a) —
    алгоритм: участники круга `r` = бойцы в слотах `SlotFilled`; выбывшие в
    круге `r` = участники `r` минус участники `r+1` (для финала «участники
    R+1» = один чемпион). Байи выпадают сами — боец с баем присутствует в
    обоих кругах. **Диапазон места берётся из структуры сетки, а не из числа
    выбывших**: после круга `r` формально остаётся `k = 2^(R−r)` участников,
    значит выбывшие получают `[k+1 … 2k]` — `5–8` для четвертьфиналов сетки
    на 8 независимо от баев (AC-8). Чемпион — `1–1`, проигравший финала —
    `2–2`. Круг `R+1` (бой за 3-е место) обрабатывается после основного
    прохода и **расщепляет** `3–4` на `3–3` и `4–4`. `OriginLabel` —
    `Round.Title` («выбыл в 1/4 финала»), у чемпиона и финалиста — свои
    подписи;
  - `ComputeGroupPlaces(groups []SourceGroup) []ResultEntry` (FR-12) —
    обёртка над существующей `ComputeOverallOrder`: строки в её порядке,
    `OriginLabel` берётся готовым («Группа 2, место 1»), а конкурентное
    ранжирование `OverallPlace` (1, 2, 2, 4) **разворачивается в диапазон**:
    для группы равных, начинающейся на месте `p` и размера `n`, —
    `[p … p+n−1]`. Для одной группы функция вырождается ровно в таблицу 0016,
    отдельной ветки не нужно;
  - `ComputeStageStatus(layout LayoutStatus, containers []StageContainer) StageStatus`
    (FR-2/FR-3), где `StageContainer struct { Status PoolStatus; Total int }`
    (`Total` — число боёв у группы, число разрешаемых пар у половины круга).
    Правила по порядку: `layout != ready` → `draft`; контейнеры с `Total == 0`
    отбрасываются; если после отбрасывания контейнеров не осталось → `ready`;
    все оставшиеся `finished` → `finished`; хоть один `active`/`finished` →
    `active`; иначе `ready`;
  - `ComputeNominationExecution(statuses []StageStatus) NominationExecution` —
    `finished`, если список непуст и все `finished`; `active`, если есть хоть
    один `active`/`finished`; иначе `none` (FR-4).
- `domain/domain.go` — правки:
  - `type StageStatus string` (`draft`/`ready`/`active`/`finished`) и
    `type NominationExecution string` (`none`/`active`/`finished`);
  - `Stage.ExecutionStatus StageStatus` — вычисляемое поле, заполняется
    сервисом при чтении (как `Pool.Status` сегодня);
  - порт `NominationProvider`: метод `SyncRegistrationState(ctx, id, hasDistributedFighters)`
    **заменяется** на `SyncNominationState(ctx, id string, hasDistributedFighters bool, execution NominationExecution) error`.
    Один вызов вместо двух — обе оси считаются в одной точке и пишутся одной
    транзакцией на стороне `nomination`; прод отсутствует, ломать нечего.
- `service/results.go` (**новый файл**):
  - `stageStatuses(ctx, nominationID) (map[string]domain.StageStatus, error)` —
    для каждого этапа собирает контейнеры с их статусами (переиспользуя
    существующие `applyArenaAndStatus` для групп и `bracketContainerStatuses`
    для сеток) и зовёт `ComputeStageStatus`;
  - `NominationResults(ctx, nominationID) (domain.NominationResults, error)` —
    этапы → `TerminalStages` → на каждый терминальный: если статус не
    `finished`, секция с `Finished == false` и пустыми `Entries`; иначе для
    `bracket` — `ResolveBracket` (уже собирается в `bracketView`) →
    `ComputeBracketPlaces`, для `groups` — те же `SourceGroup`, что собирает
    отбор 0019 (`sourceGroupsForRule` разложить: выделить
    `groupsWithStandings(ctx, stageID)`, чтобы протокол не тянул правило) →
    `ComputeGroupPlaces`;
  - `syncNomination(ctx, nominationID) error` — единая точка push'а: считает
    `hasDistributedAcrossStages` (существующая) и
    `ComputeNominationExecution(stageStatuses)` и зовёт
    `NominationProvider.SyncNominationState`.
- `service/service.go`, `service/bracket.go`, `service/schema.go`,
  `service/seeding.go` — заменить два существующих вызова
  `SyncRegistrationState` на `syncNomination` и **добавить его в точки, где
  меняется прогресс боёв или состав схемы**: `SetStatus` (фиксация/
  расфиксация), `StartCurrentBout`, `ScoreCurrentBout`, `FinishCurrentBout`,
  `ReopenCurrentBout`, `ResetCurrentBout`, `CreateStage`, `DeleteStage`,
  `BuildStage`, `ApplyFormat`, `UpdateStage`. Постановку/снятие пула с арены
  трогать не нужно: `preparing` на исполнительный статус не влияет (FR-2).
  Критерий тот же, что в 0012 FR-10 — по результирующему состоянию, а не по
  имени RPC.
- `service/service.go` — `NominationLive` дополняет снапшот полем `Results`;
  `stagesForRead`/`StagesForNomination` проставляют `Stage.ExecutionStatus`.
- `api/handler.go` — маппер `toProtoStage` заполняет `execution_status`;
  новые мапперы протокола; хендлер `GetNominationResults`.
- `testutil/fake_nomination_provider.go` — метод порта переименовать,
  запоминать обе оси (для проверки push'а в service-тестах).

### Модуль `nomination` — вторая ось состояния

- `domain/domain.go`:
  - `type ExecutionState string` — `none`/`active`/`finished`;
  - `Nomination.Execution ExecutionState` — внутреннее поле;
  - метод `func (n Nomination) PublicStatus() Status` — `Execution != none`
    → соответствующий `StatusActive`/`StatusFinished`, иначе `n.Status`
    (NFR-4). Поле `Status` сохраняет прежний смысл «приём заявок» — так
    гейты 0012 (`ReopenRegistration`, `SyncRegistrationState`) продолжают
    работать без изменений;
  - `Repository`: новый метод
    `SetExecutionState(ctx, id string, state ExecutionState) (Nomination, error)`.
- `service/service.go` — `SyncExecutionState(ctx, nominationID string, state ExecutionState) error`:
  идемпотентно пишет ось (без чтения-сравнения — запись дешевле).
  Существующая `SyncRegistrationState` не меняется.
- `repo/queries/nomination.sql` + `repo/repo.go` — `SetExecutionState`
  (`-- name: SetExecutionState :one`), `execution_state` во всех
  `SELECT`/`RETURNING`; `make sqlc`.
- `api/handler.go` — маппер номинации отдаёт `PublicStatus()` вместо `Status`
  (одна строка; все RPC модуля отдают номинацию через один маппер).
- `migrations/00003_execution_state.sql` (goose):

```sql
-- +goose Up
ALTER TABLE nomination.nominations
    ADD COLUMN execution_state TEXT NOT NULL DEFAULT 'none';

ALTER TABLE nomination.nominations
    ADD CONSTRAINT chk_nominations_execution_state
        CHECK (execution_state IN ('none', 'active', 'finished'));

-- Ось приёма заявок больше не может принимать значения фазы боёв: они
-- переехали в execution_state (спека 0021, NFR-4). CHECK из 00002 допускал
-- 'active'/'finished' как задел 0012 — сужаем.
ALTER TABLE nomination.nominations
    DROP CONSTRAINT chk_nominations_status,
    ADD CONSTRAINT chk_nominations_status CHECK (status IN ('open', 'closed'));

-- +goose Down
ALTER TABLE nomination.nominations
    DROP CONSTRAINT IF EXISTS chk_nominations_status,
    ADD CONSTRAINT chk_nominations_status
        CHECK (status IN ('open', 'closed', 'active', 'finished'));

ALTER TABLE nomination.nominations
    DROP CONSTRAINT IF EXISTS chk_nominations_execution_state,
    DROP COLUMN IF EXISTS execution_state;
```

  Зачем колонка, а не новый статус в `status`: две оси ортогональны и обе
  нужны одновременно — при откате из `FINISHED` система обязана помнить, к
  чему возвращаться (`open` или `closed` + причина, 0012 FR-4/FR-5).
  Backfill не нужен (`DEFAULT 'none'`), корректность приходит первым же
  push'ом из `stage` — как и в 0012 (NFR-4 той спеки).

### `internal/platform`

- `stage_nomination_provider.go` — `SyncNominationState` вызывает
  `nominationSvc.SyncRegistrationState` и `SyncExecutionState`
  последовательно; порядок значения не имеет (оси независимы).

### Межмодульные зависимости

Направление прежнее: `stage → nomination` (ADR 0014 §8). Обратной связи не
появляется: `nomination` ничего не спрашивает у `stage` — он только принимает
push. Цикл, о котором предупреждает ADR 0014 (альтернатива B), не возникает.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

- **BFF**: `app/api/nominations/[id]/results/route.ts` (Node runtime) —
  `GET` → `StagePublicService.GetNominationResults`, публичный (без токена),
  по образцу `public-pools/route.ts`. Живой канал
  (`app/api/nominations/[id]/live/route.ts`, SSE 0014) правки не требует —
  `results` едет внутри снапшота.
- `entities/nomination/lib/types.ts` — подписи статусов: «идёт» для `ACTIVE`,
  «завершена» для `FINISHED` (сейчас `nominationStatusLabel` покрывает
  `OPEN`/`CLOSED`), варианты бейджа.
- `entities/nomination-results/` (**новая сущность**):
  - `lib/types.ts` — типы протокола из proto + хелперы: `formatPlace(entry)`
    (`5–8` при `placeFrom != placeTo`, иначе `5`), `podium(section)` —
    строки, чей диапазон пересекает места 1–3 (при `3–4` в пьедестал попадают
    обе строки), `hasPlaces(section)`;
  - `model/get-nomination-results.ts` — server-only fetch для SSR
    админского экрана.
- `entities/nomination-live/` — тип снапшота дополняется `results`
  (генерируется, правится только маппинг, если он ручной).
- `widgets/nomination-results/`:
  - `nomination-results.tsx` — секции протокола: заголовок этапа, пьедестал
    (крупно, NFR-3), таблица «место — боец — клуб — происхождение»;
  - `podium.tsx` — призовые места; при `3–4` без боя за 3-е место обе строки
    показываются карточками с подписью «3–4»;
  - оговорка про сводный порядок при `placesFromOverallOrder` (FR-12);
  - пропс `showUnfinished` — админка показывает недоигранные секции
    («этап не доигран»), публика их не рендерит (FR-15/FR-19).
- **Публичная страница** `app/nominations/[id]/page.tsx` — блок итогов выше
  `NominationPoolsPublic` (FR-17). Данные — из `initialSnapshot.results`
  (SSR) и далее из живого снапшота внутри клиентского компонента: значит
  виджет рендерится **внутри** `NominationPoolsPublic`/рядом с ним через тот
  же `useNominationLive`, а не отдельным серверным блоком, — иначе итоги не
  обновятся без перезагрузки (FR-18).
- **Админка**: `app/(admin)/admin/nominations/[id]/stages/page.tsx` (экран
  схемы, 0019 FR-25 / 0020 FR-1) — блок протокола с `showUnfinished`,
  данные из BFF-ручки результатов.
- State: server-state — TanStack Query поверх BFF-ручки (админка), живые
  итоги — существующий `useNominationLive` (0014). Zustand не нужен.

## События

> Placeholder. Event-Driven Design ещё не введён.

- Издаёт: нет.
- Потребляет: нет.

Связь `stage → nomination` остаётся синхронным push'ом через порт — ровно как
решено 0012 (FR-10) и подтверждено ADR 0014 (§8). Событийная шина здесь ничего
не улучшила бы: переход обязан быть виден в том же ответе, что и вызвавшая его
мутация.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Юнит (`stage/domain`)** — основная масса, без портов и БД:
  - `ComputeBracketPlaces`: полная сетка на 8 с боем за 3-е — `1`, `2`, `3`,
    `4`, четыре строки `5–8` (AC-6); без боя за 3-е — две строки `3–4` и
    четыре `5–8`, ни одной одиночной `3` (AC-7); сетка на 8 с шестью
    посеянными — диапазон выбывших в первом круге остаётся `5–8` при двух
    строках (AC-8); сетка на 4; недоигранная сетка не вызывается, но функция
    обязана не паниковать;
  - `ComputeGroupPlaces`: одна группа с двумя равными — `1`, `2–3`, `2–3`,
    `4` (AC-10); несколько групп = сводный порядок, развёрнутый в диапазоны
    (AC-11);
  - `ComputeStageStatus`: draft; ready без боёв; активный; завершённый;
    завершённый при пустом контейнере (AC-16); контейнер сетки, завершённый
    баями;
  - `ComputeNominationExecution`: пусто → none; смесь → active; все finished
    → finished;
  - `TerminalStages`: линейная схема, две параллельные ветки (AC-9),
    несимметричные ветки (ADR 0014 §1).
- **Юнит (`stage/service`, fake-репо)**: `NominationResults` собирает секции
  по терминальным этапам и прячет места недоигранных (AC-12); `syncNomination`
  пушит `active` после старта боя (AC-1), `finished` после последнего (AC-3),
  обратно `active` после `ReopenCurrentBout` (AC-4), `active` при создании
  нового этапа и `finished` после его удаления (AC-5), не пушит `finished`
  при недоигранном этапе (AC-2).
- **Юнит (`nomination/service`, fake-репо)**: `SyncExecutionState` пишет ось;
  `PublicStatus` вытесняет регистрационный статус; `SyncRegistrationState` и
  гейты `Reopen`/`Close` не изменились (регресс 0012, AC-13).
- **E2E ручек (`stage/api`, httptest + Connect, fake-репо)**:
  `GetNominationResults` — счастливый путь и `NotFound`; `execution_status`
  в `ListStages`; `results` в `GetNominationLive`.
- **Интеграционные (`nomination/integration`, testcontainers)**: миграция
  00003 применяется, `execution_state` читается/пишется, публичный
  `GetNomination` отдаёт `ACTIVE` после push'а.
- **Интеграционные (`stage/integration`)**: сквозной сценарий — сформировать
  группы, доиграть, сформировать сетку, доиграть, проверить статус номинации
  `FINISHED` и протокол; пересмотр результата возвращает `ACTIVE` (AC-3/AC-4).
- **Web (Vitest)**: BFF-ручка результатов (mock транспорта, маппинг
  `connect.Code` → HTTP); `nominationStatusLabel` для новых значений; хелперы
  `formatPlace` (`5–8` против `5`) и `podium` (`3–4` → обе карточки в
  пьедестале), `hasPlaces`; `showUnfinished` фильтрует секции.

## Риски и открытые вопросы

- **Стоимость `syncNomination` на каждом бою.** Точка вызова — ведение боя
  (`Finish/Score/Start`), а вычисление статусов этапов читает контейнеры и бои
  всей номинации. Ожидаемый масштаб (десятки бойцов, единицы этапов) это
  выдерживает, но если профиль покажет иное — статусы этапов считаются из тех
  же данных, что уже загружает `boardForPool`; оптимизация будет локальной.
- **`ScoreCurrentBout` формально не меняет исполнительный статус** (бой уже
  `active`), но включён в список точек push'а ради единообразия правила
  «после мутации — синхронизация». Если это окажется заметным по стоимости —
  убрать его первым.
- **Сводный порядок как источник мест** (FR-12) наследует известное искажение
  0019 (NFR-2). Смягчаем только оговоркой в интерфейсе; при появлении
  требования нормировки — отдельная спека, как предписывает ADR 0014 §7.
- **`Total` контейнера сетки** — число разрешаемых пар половины, а не боёв
  (0018 FR-17). При сборке `StageContainer` для сетки нужно брать тот же
  знаменатель, что `computeHalfStatus`, иначе половина из одних баев ошибочно
  отбросится как «контейнер без боёв».
- **Точки push'а — ручная дисциплина.** Забытый вызов не ловится
  компилятором. Митигируется service-тестами на каждый мутирующий путь
  (см. «Тестирование») — тем же способом, что и в 0012.

# Plan: Доменные пробелы, вскрытые редизайном

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: ready
- Дата: 2026-08-25
- Спека: `./spec.md`

## Обзор решения

Пять независимых доменных доработок в четырёх существующих модулях, новых
bounded context'ов нет:

1. **Гейт на удаление номинации** (`nomination`) — перед `Delete` спрашивает
   `stage` и `bout` через новые cross-module порты (тот же приём, что
   `ActiveTournamentIDProvider`), без изменений в proto.
2. **Восстановление посева** (`stage` + `fighter`) — `fighter.WithdrawFighter`/
   `ReturnFighter` синхронно уведомляют новый порт `stage`-адаптера (тот же
   приём, что `application.RegistrationSink` → `fighter`); `stage` хранит
   «память» об изъятом членстве в новой таблице и восстанавливает её только
   пока стадия ещё `draft`. Существующий путь для стадий вне `draft` уже
   работает правильно без изменений (см. «Обоснование» ниже) — это сузило
   реализацию до одного случая.
3. **Обратная проекция «учётка↔боец» + слияние дублей** (`fighter`) — новые
   admin RPC поверх уже существующего `origin_user_id`; слияние дополнительно
   репойнтит денормализованные `fighter_id` в `stage`/`bout` через новые
   cross-module порты той же формы.
4. **История заявки для заявителя** — **только web**: сервер уже отдаёт
   историю владельцу (`application.Service.Get`), новых серверных изменений
   нет.
5. **Программа турнира по дням** (`tournament`) — две новые дочерние таблицы
   (день → пункты), full-replace семантика как у `contacts`.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

### `proto/hema/v1/nomination.proto` — без изменений

Гейт — доменная ошибка, различимая по тексту (существующая конвенция:
`web/src/lib/grpc/errors.ts` прокидывает `err.rawMessage` в BFF-ответ, клиент
уже сегодня различает несколько разных 409 по тексту, см. `0036`). Два
разных отказа → два разных `connect.CodeFailedPrecondition` с разным
сообщением, `DeleteNominationResponse` остаётся пустым.

### `proto/hema/v1/fighter.proto`

```proto
service FighterAdminService {
  ...
  // FindFighterByAccount ищет бойца турнира по учётке пользователя (спека
  // 0040, FR-9). Пустой fighter в ответе — «у этой учётки нет бойца в этом
  // турнире», не ошибка (тот же приём, что GetMyFighter/FR-41 спеки 0038).
  rpc FindFighterByAccount(FindFighterByAccountRequest) returns (FindFighterByAccountResponse);
  // MergeFighters сводит дубль source в target: участия переносятся на
  // target (совпадающие по номинации — не дублируются), source помечается
  // объединённым (FIGHTER_STATUS_MERGED), не удаляется физически (FR-10).
  rpc MergeFighters(MergeFightersRequest) returns (MergeFightersResponse);
}

message FindFighterByAccountRequest {
  string user_id = 1;
  string tournament_id = 2; // пусто → активный турнир, как ListRoster
}
message FindFighterByAccountResponse { Fighter fighter = 1; }

message MergeFightersRequest {
  string source_fighter_id = 1;
  string target_fighter_id = 2; // «итоговая» запись — её origin_user_id и
                                 // снапшот имени/клуба остаются в силе
}
message MergeFightersResponse { Fighter fighter = 1; } // итоговая запись target
```

```proto
enum FighterStatus {
  FIGHTER_STATUS_UNSPECIFIED = 0;
  FIGHTER_STATUS_ACTIVE = 1;
  FIGHTER_STATUS_WITHDRAWN = 2;
  FIGHTER_STATUS_MERGED = 3; // FR-10: запись-источник после слияния
}

message Fighter {
  ...
  // linked_account_id (спека 0040, FR-8): непусто, если у бойца есть
  // привязанная учётка (origin_user_id). Заполняется ТОЛЬКО в ответах
  // FighterAdminService — FighterPublicService/FighterService (свой боец,
  // ADR 0016) это поле не сериализуют (граница ADR 0016 не расширяется,
  // проверяется на уровне api-хендлера, не сообщения).
  string linked_account_id = 10;
  string linked_account_display_name = 11;
  // merged_into_id (FR-10): непусто, если status = FIGHTER_STATUS_MERGED —
  // id записи, в которую слит этот боец.
  string merged_into_id = 12;
}
```

### `proto/hema/v1/tournament.proto`

```proto
// TournamentProgramItem — один пункт программы дня (спека 0040, FR-14).
message TournamentProgramItem {
  string time_label = 1; // «9:00» — короткая метка, не строгий формат
  string text = 2;       // «Сбор участников»
}

// TournamentProgramDay — один день программы турнира.
message TournamentProgramDay {
  string date = 1; // YYYY-MM-DD, без временной зоны (не привязан к
                    // event_start_at/event_end_at, FR-14a)
  repeated TournamentProgramItem items = 2;
}

message Tournament {
  ...
  repeated TournamentProgramDay program = 13; // упорядочен: день, внутри дня — пункт
}

message UpdateActiveTournamentRequest {
  ...
  repeated TournamentProgramDay program = N; // полная замена, как contacts
}
```

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

### `modules/nomination` — гейт на удаление (сценарий 1)

- `domain/domain.go`: два сентинел-порта и две доменные ошибки:
  ```go
  type PoolOccupancyChecker interface {
      HasDistributedFighters(ctx context.Context, nominationID string) (bool, error)
  }
  type BoutOccupancyChecker interface {
      HasBouts(ctx context.Context, nominationID string) (bool, error)
  }
  var (
      ErrHasDistributedFighters = errors.New("nomination: has distributed fighters")
      ErrHasBouts                = errors.New("nomination: has bouts")
  )
  ```
- `service/service.go`: `Deps` получает `Pools PoolOccupancyChecker` и
  `Bouts BoutOccupancyChecker` (конструктор `New(repo, ..., pools, bouts)`).
  `Delete` перед `repo.Delete`: если `Pools.HasDistributedFighters` → true —
  `ErrHasDistributedFighters`; иначе если `Bouts.HasBouts` → true —
  `ErrHasBouts`; иначе — удаление как сегодня (FR-1/FR-3/FR-3a).
- `api/handler.go`: маппинг `ErrHasDistributedFighters`/`ErrHasBouts` →
  `connect.CodeFailedPrecondition` с их текстом (FR-2) — тот же `switch`, что
  уже маппит `ErrNotFound`/`ErrInvalidInput`/`ErrAlreadyExists`.
- Никаких миграций/proto — не новый модуль, чужие данные не читаются напрямую
  (ADR 0002): только через новые адаптеры ниже.

### `modules/stage` — адаптер гейта + память посева (сценарии 1, 2)

- `repo/queries/stage.sql`: новый запрос
  `-- name: ExistsDistributedFighterForNomination :one`
  ```sql
  SELECT EXISTS(SELECT 1 FROM stage.pool_members WHERE nomination_id = $1);
  ```
  (денормализация `nomination_id` в `pool_members` уже есть — без join).
- Новый файл `stage/occupancy_adapter.go`: адаптер
  `PoolOccupancyAdapter{svc *service.Service}` реализует
  `nomination/domain.PoolOccupancyChecker` поверх этого запроса —
  экспортируется для wiring, тот же приём, что
  `ActiveTournamentIDProvider`.
- **Память посева (FR-4..FR-6)**:
  - `migrations/00005_withdrawn_seeds.sql`:
    ```sql
    -- withdrawn_seeds — «память» о членстве в пуле бойца, выведенного с
    -- турнира, пока стадия пула ещё draft (спека 0040, FR-4). Композитный
    -- PK: боец может быть одновременно посеян в стадиях разных номинаций.
    -- Вне draft запись не заводится — там членство и так не подчищается
    -- лениво (assembleLayout фильтрует его только для чтения), и возврат
    -- уже работает без этой таблицы.
    CREATE TABLE stage.withdrawn_seeds (
        fighter_id    UUID NOT NULL,
        nomination_id UUID NOT NULL,
        stage_id      UUID NOT NULL,
        pool_id       UUID NOT NULL,
        withdrawn_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (fighter_id, nomination_id)
    );
    ```
  - `repo/queries/stage.sql`: `CaptureWithdrawnSeed` (перенос строки
    `pool_members` → `withdrawn_seeds` + `DELETE` — одна репо-функция, две
    стейтмента в транзакции пула модуля), `DraftMembershipsByFighter`
    (какие строки `pool_members` этого бойца лежат в `draft`-стадиях —
    join `pool_members`→`pools`→`stages` по `stage_id`, фильтр
    `stages.status='draft'`), `RestoreWithdrawnSeed` (если стадия всё ещё
    `draft` и пул ещё существует — `INSERT` в `pool_members` +
    `DELETE` из `withdrawn_seeds`; иначе — только `DELETE` из
    `withdrawn_seeds`, best-effort истечение).
  - `service/service.go`: два новых метода сервиса
    `OnFighterWithdrawn(ctx, fighterID)` (находит `draft`-членства бойца,
    для каждого — `CaptureWithdrawnSeed`) и
    `OnFighterReturned(ctx, fighterID)` (находит строки
    `withdrawn_seeds` бойца, для каждой — `RestoreWithdrawnSeed`).
  - Новый файл `stage/seeding_sink_adapter.go`: адаптер
    `SeedingSinkAdapter{svc *service.Service}` реализует новый порт
    `fighter/domain.SeedingWithdrawalSink`:
    ```go
    type SeedingWithdrawalSink interface {
        OnFighterWithdrawn(ctx context.Context, fighterID string) error
        OnFighterReturned(ctx context.Context, fighterID string) error
    }
    ```
  - **Репойнт при слиянии (сценарий 3).** `repo/queries/stage.sql`:
    `-- name: RepointFighter :execrows`
    ```sql
    UPDATE stage.pool_members SET fighter_id = @target_id
    WHERE fighter_id = @source_id
      AND NOT EXISTS (
        SELECT 1 FROM stage.pool_members m2
        WHERE m2.stage_id = stage.pool_members.stage_id AND m2.fighter_id = @target_id
      );
    -- Остаток (source и target оба уже сидели в одной стадии — коллизия
    -- uq_members_stage_fighter) не репойнтится молча: source-строка в этом
    -- редком случае остаётся за source, слияние не теряет данные, но и не
    -- разрешает конфликт автоматически — снятие такой строки delegировано
    -- отдельному ручному действию admin (снять с пула вручную), не merge.
    ```
    Аналогично `withdrawn_seeds` — своя `RepointWithdrawnSeed` (та же
    защита от коллизии по `(target_id, nomination_id)`).
  - `service/service.go`: `RepointFighter(ctx, sourceID, targetID string)
    error` — вызывает обе репо-функции.
  - `stage/repoint_adapter.go`: `RepointAdapter` реализует
    `fighter/domain.StageRepointer`.

### `modules/bout` — адаптер гейта + репойнт при слиянии (сценарии 1, 3)

- `repo/queries/bout.sql`: `-- name: ExistsBoutForNomination :one`
  `SELECT EXISTS(SELECT 1 FROM bout.bouts WHERE nomination_id = $1);`
  (использует существующий `idx_bouts_nomination`).
- `bout/occupancy_adapter.go`: `BoutOccupancyAdapter` реализует
  `nomination/domain.BoutOccupancyChecker`.
- `repo/queries/bout.sql`: `-- name: RepointFighter :execrows`
  ```sql
  UPDATE bout.bouts SET fighter_a_id = $2 WHERE fighter_a_id = $1;
  UPDATE bout.bouts SET fighter_b_id = $2 WHERE fighter_b_id = $1;
  ```
  Только id — денормализованные `fighter_a_name`/`fighter_a_club` остаются
  историческим снапшотом на момент боя (решение: результат «принадлежит»
  target по идентификатору, но текст боя не переписывается задним числом;
  см. «Риски»).
- `bout/repoint_adapter.go`: `RepointAdapter` реализует новый порт
  `fighter/domain.BoutRepointer{RepointFighter(ctx, oldID, newID) error}`.

### `modules/fighter` — обратная проекция и слияние (сценарий 3), wiring сценария 2

- `domain/domain.go`: добавить `StatusMerged`, поле `MergedIntoID string`
  (пусто, если не merged), константы ошибок `ErrSameFighter`,
  `ErrCrossTournamentMerge`, `ErrAlreadyMerged`. Новые порты:
  ```go
  type SeedingWithdrawalSink interface { /* см. stage выше */ }
  type StageRepointer interface {
      RepointFighter(ctx context.Context, oldID, newID string) error
  }
  type BoutRepointer interface {
      RepointFighter(ctx context.Context, oldID, newID string) error
  }
  type AccountDirectory interface {
      DisplayNames(ctx context.Context, ids []string) (map[string]string, error)
  }
  ```
- `service/service.go`: `Deps`/конструктор получает `Seeding
  SeedingWithdrawalSink`, `Stage StageRepointer`, `Bout BoutRepointer`,
  `Accounts AccountDirectory` (последний — переиспользует существующий
  `auth.DisplayNameProvider`, тот же порт-шейп, что уже использует
  `application`, просто в новом месте вызова).
  - `WithdrawFighter`/`ReturnFighter`: после `repo.Update` — вызов
    `s.seeding.OnFighterWithdrawn`/`OnFighterReturned` (best-effort,
    синхронно, без распределённой транзакции — тот же паттерн, что
    `RegistrationSink`; ошибка сайд-эффекта не откатывает already-committed
    смену статуса бойца, только логируется/возвращается вызывающему как
    предупреждение — решается в T-задаче по месту, см. «Риски»).
  - `FindByAccount(ctx, userID, tournamentID string) (domain.Fighter,
    bool, error)` — тонкая обёртка над уже существующим `repo.FindByOrigin`
    (тем же методом, что использует `MyFighter`/ADR 0016), доступная теперь
    и из admin-хендлера, не только из `MeHandler` (FR-9).
  - `Roster`/`GetFighter` (существующие методы листинга) обогащаются
    `LinkedAccountID`/`LinkedAccountDisplayName` через `origin_user_id` +
    батч `s.accounts.DisplayNames` — тот же батч-приём, что
    `application.Service.Get` (один вызов на весь список, не N+1) (FR-8).
  - `MergeFighters(ctx, sourceID, targetID string) (domain.Fighter, error)`:
    1. Загрузить обе записи; `sourceID == targetID` → `ErrSameFighter`;
       разные `tournament_id` → `ErrCrossTournamentMerge`; любая уже
       `status=merged` → `ErrAlreadyMerged`.
    2. `repo.MergeParticipations(sourceID, targetID)` — SQL ниже.
    3. `repo.ClearOriginUserID(sourceID)` (FR-10a: у source привязка
       снимается независимо от того, была ли она; у target остаётся как
       была — «итоговая» связь это её собственная, не source).
    4. `repo.SetMerged(sourceID, targetID)` (`status='merged'`,
       `merged_into_id=targetID`).
    5. `s.stage.RepointFighter(ctx, sourceID, targetID)`,
       `s.bout.RepointFighter(ctx, sourceID, targetID)` — тем же
       best-effort приёмом, что и withdraw/return (см. «Риски»).
    6. Вернуть перечитанного `target`.
- `repo/queries/fighter.sql`:
  ```sql
  -- name: MergeParticipations :exec
  DELETE FROM fighter.participations p
  USING fighter.participations t
  WHERE p.fighter_id = @source_id AND t.fighter_id = @target_id
    AND p.nomination_id = t.nomination_id;

  UPDATE fighter.participations SET fighter_id = @target_id
  WHERE fighter_id = @source_id;

  -- name: ClearOriginUserID :exec
  UPDATE fighter.fighters SET origin_user_id = NULL, updated_at = now()
  WHERE id = @fighter_id;

  -- name: SetMerged :exec
  UPDATE fighter.fighters
  SET status = 'merged', merged_into_id = @target_id, updated_at = now()
  WHERE id = @source_id;
  ```
- `migrations/00002_merge.sql`:
  ```sql
  ALTER TABLE fighter.fighters
      ADD COLUMN merged_into_id UUID NULL,
      ADD CONSTRAINT chk_fighters_status_merge
          CHECK (status IN ('active', 'withdrawn', 'merged')),
      ADD CONSTRAINT chk_fighters_merged_into_when
          CHECK ((status = 'merged') = (merged_into_id IS NOT NULL));
  -- Без FK на fighters(id) той же таблицы: cross-row self-reference без FK
  -- допустим (не кросс-схемная граница), но сервис уже гарантирует
  -- существование target — FK добавил бы только защиту от прямых SQL-правок.
  CREATE INDEX idx_fighters_merged_into ON fighter.fighters (merged_into_id)
      WHERE merged_into_id IS NOT NULL;
  ```
  Уникальный индекс `uq_fighters_origin_per_tournament` не меняется — он и
  так игнорирует `NULL` (`ClearOriginUserID` гарантирует, что merged-записи
  туда не попадают).
- `api/handler.go` (`FighterAdminService`): `FindFighterByAccount`,
  `MergeFighters` — новые хендлеры; `Fighter`-маппер (proto↔domain)
  получает `linked_account_id`/`linked_account_display_name`/
  `merged_into_id` **только** в `AdminHandler`-версии маппера — у
  `PublicHandler`/`MeHandler` отдельная (уже существующая) функция
  маппинга, которая эти поля не трогает (ADR 0016 не пересматривается).
- `module.go`: `Register` пробрасывает новые `Deps`; composition root
  (`internal/platform`) конструирует `stage.SeedingSinkAdapter`,
  `stage.RepointAdapter`, `bout.RepointAdapter`, `auth.DisplayNameProvider`
  **до** регистрации `fighter`, аналогично порядку, в котором сегодня
  строится `tournament.ActiveTournamentIDProvider` перед `fighter`/
  `nomination`. Симметрично: адаптеры `nomination` (`PoolOccupancyAdapter`,
  `BoutOccupancyAdapter`) строятся после `stage`/`bout`, но до регистрации
  `nomination`.

### `modules/tournament` — программа по дням (сценарий 5)

- `migrations/00004_program.sql`:
  ```sql
  -- program_days / program_items — программа турнира по дням (спека 0040,
  -- FR-14). Дочерние таблицы (не jsonb): пункты упорядочены и редактируются
  -- по одному в форме админки, jsonb-блоб усложнил бы точечную правку
  -- порядка без пользы (в отличие от contacts, здесь есть вложенный уровень
  -- день→пункты, поэтому решение — не «buttom как в 0037», а отдельные
  -- таблицы).
  CREATE TABLE tournament.program_days (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tournament_id UUID NOT NULL,
      event_date    DATE NOT NULL,
      position      INTEGER NOT NULL,
      CONSTRAINT uq_program_days_tournament_position UNIQUE (tournament_id, position)
  );
  CREATE INDEX idx_program_days_tournament ON tournament.program_days (tournament_id, position);

  CREATE TABLE tournament.program_items (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      day_id     UUID NOT NULL REFERENCES tournament.program_days(id) ON DELETE CASCADE,
      position   INTEGER NOT NULL,
      time_label TEXT NOT NULL DEFAULT '',
      text       TEXT NOT NULL,
      CONSTRAINT chk_program_items_text CHECK (length(btrim(text)) > 0),
      CONSTRAINT uq_program_items_day_position UNIQUE (day_id, position)
  );
  CREATE INDEX idx_program_items_day ON tournament.program_items (day_id, position);
  ```
- `domain/domain.go`: `ProgramDay{Date time.Time; Items []ProgramItem}`,
  `ProgramItem{TimeLabel, Text string}`; `Tournament.Program
  []ProgramDay`; `UpdateInput.Program []ProgramDay`.
- `repo/repo.go`: `UpdateActiveTournament` расширяется — та же
  full-replace транзакция, что уже делает для `contacts` (удалить все
  `program_days` турнира — каскадом уходят `program_items` — вставить
  заново по присланному порядку).
- `service/service.go`: валидация `UpdateInput.Program` — непустой `Text`
  каждого пункта (`chk_program_items_text` дублируется на уровне домена ради
  читаемой ошибки до похода в БД), `position` не передаётся наружу explicit
  (сервис проставляет по индексу среза — тот же приём, что contacts).
- `api/handler.go`: маппинг proto↔domain для `program` в
  `GetActiveTournament`/`UpdateActiveTournament`.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

### Гейт на удаление номинации (сценарий 1)

- `features/nomination-management/api/use-delete-nomination.ts` +
  `app/api/nominations/[id]/route.ts` (DELETE): различить два новых
  сообщения `FailedPrecondition` через `err.rawMessage` (тот же приём 0036)
  и вернуть différenцируемый код ошибки в JSON (`"has_distributed_fighters"`
  / `"has_bouts"`), не просто generic 409.
- `features/nomination-management/ui/nominations-screen.tsx`: диалог
  удаления (уже есть, ввод названия) — при отказе показывает конкретную
  причину вместо общего тоста ошибки.

### Восстановление посева (сценарий 2)

- Backend уже отдаёт актуальный `Layout` при рефетче после `ReturnFighter` —
  никакого нового поля не нужно (см. «Обоснование»): UI просто рефетчит
  раскладку и по тому, где оказался боец (`Pools[i].Members` vs
  `Unassigned`), решает, какой тост показать. Меняется только
  `features/fighter-management` (или где вызывается `ReturnFighter`) —
  тост «Возвращён в пул N» / «Возвращён, посев не восстановлен —
  распределите вручную» (FR-6).

### Обратная проекция и слияние (сценарий 3)

- `features/fighter-management/api/requests.ts`: новые запросы
  `findFighterByAccount`, `mergeFighters` + BFF-ручки
  `app/api/fighters/find-by-account/route.ts`,
  `app/api/fighters/merge/route.ts`.
- `entities/fighter/lib/types.ts`: `linkedAccountId`,
  `linkedAccountDisplayName`, `mergedIntoId`, `status: 'merged'`.
- `features/fighter-management/ui/*`: карточка/строка ростера показывает
  бейдж привязанной учётки (FR-8); новая форма поиска «по учётке» (FR-9);
  диалог слияния — выбор source/target из ростера, подтверждение (тот же
  канон «необратимое действие — диалог с подтверждением», что 0028/0038)
  (FR-10).

### История заявки для заявителя (сценарий 4)

- Ноль изменений в BFF — `app/api/applications/[id]/route.ts` уже отдаёт
  `history` (см. код выше). Публичная фича заявителя (страница/диалог
  своей заявки) добавляет блок истории — переиспользует
  `features/application-review/ui/application-history.tsx` (уже есть,
  собран для admin) без дублирования: либо прямой импорт компонента (если
  публичная фича может зависеть от `application-review` по FSD-слоям),
  либо перенос компонента в `entities/application` как общий, если прямой
  импорт между фичами нарушает границы — решается на этапе кода по месту в
  `web/AGENTS.md`.

### Программа турнира по дням (сценарий 5)

- `entities/tournament/lib/types.ts`: `program: TournamentProgramDay[]`.
- `features/tournament-settings/ui/*`: редактор программы — список дней,
  внутри каждого — список пунктов «время + текст», добавление/удаление
  дня и пункта, порядок — по индексу в массиве (drag/кнопки вверх-вниз —
  на усмотрение реализации, без обязательного применения гайдов 0039 п.5,
  т.к. список коротких текстовых полей, а не карточек с DnD-семантикой,
  как посев/схема).
- `widgets/home/tournament-strip.tsx` (афиша) и
  `widgets/tournament-about/tournament-about-screen.tsx` (`/about`):
  блок программы по дням рядом с местом/взносом/регламентом (FR-15);
  пустая программа — раздел не рендерится (FR-16), тот же приём, что уже
  используют соседние опциональные поля 0037/0039.

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей).

- Издаёт: нет.
- Потребляет: нет. Кросс-модульные эффекты withdraw/return/merge —
  синхронные in-process вызовы через новые порты (тот же паттерн, что
  `application.FighterRegistrationSink`), не события.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **nomination/service** (fake `PoolOccupancyChecker`/`BoutOccupancyChecker`):
  `Delete` отказывает при true/true, true/false, false/true; проходит при
  false/false.
- **stage/service**: `OnFighterWithdrawn` переносит `draft`-членство в
  память и удаляет из `pool_members`; не трогает членства вне `draft`.
  `OnFighterReturned` восстанавливает, если стадия всё ещё `draft` и пул
  существует; иначе — тихо освобождает память, боец остаётся
  «нераспределённым».
- **stage/repo (интеграционные, testcontainers)**: `ExistsDistributedFighterForNomination`,
  `CaptureWithdrawnSeed`/`RestoreWithdrawnSeed` на реальной PG (partial-unique
  и каскады важны).
- **bout/service+repo**: `ExistsBoutForNomination`, `RepointFighter`
  переносит оба борта (`fighter_a_id`/`fighter_b_id`) без изменения
  снапшота имени/клуба.
- **fighter/service** (fake `Stage`/`Bout` репойнтеры, fake
  `AccountDirectory`): `MergeFighters` — участия объединяются без
  дублей по номинации, `origin_user_id` снимается у source, `status`/
  `merged_into_id` выставлены; `ErrSameFighter`/`ErrCrossTournamentMerge`/
  `ErrAlreadyMerged`. `FindByAccount`, обогащение ростера
  `LinkedAccountID`/`DisplayName`.
- **fighter/api (httptest+Connect)**: `FindFighterByAccount`,
  `MergeFighters`, поля `linked_account_*`/`merged_into_id` — присутствуют
  в `FighterAdminService`, отсутствуют в ответах `FighterPublicService`/
  `FighterService` (регресс-тест границы ADR 0016).
- **tournament/service+repo**: full-replace `program` (пустой → непустой,
  непустой → другой набор, непустой → пустой), `chk_program_items_text`.
- **Web (Vitest)**: BFF-различение двух `FailedPrecondition` для удаления
  номинации; парсер `program` в `entities/tournament`; рендер блока истории
  на публичной заявке (owner видит, чужой — нет, тест уже частично есть на
  уровне BFF `route.test.ts` для доступа — расширяется на факт наличия
  `history` в ответе, если не проверялось).

## Риски и открытые вопросы

- **Best-effort кросс-модульные side-effects без распределённой
  транзакции.** `WithdrawFighter`→`stage.OnFighterWithdrawn`,
  `MergeFighters`→`stage.RepointFighter`/`bout.RepointFighter` — каждый
  шаг коммитится в своей PG-схеме отдельно (нет 2PC, событийная шина не
  введена, ADR 0002/шаблон «События»). Частичный сбой (напр. фиговый шаг
  `bout.RepointFighter` после успешного `stage.RepointFighter`) оставит
  несогласованность до ручного повтора. Это тот же риск, что уже принят
  `RegistrationSink` (0007) — не новый прецедент, но `MergeFighters`
  трёхшаговый (fighter-локально → stage → bout), риск на нём выше. Смягчение:
  каждый шаг идемпотентен (повторный `RepointFighter` на уже
  репойнтнутые строки — no-op, `WHERE fighter_a_id=$1` просто не находит
  строк), поэтому ручной повтор безопасен; отдельной retry-инфраструктуры
  в этой спеке не заводится.
- **`RepointFighter` не переписывает исторический снапшот боя.** После
  слияния `bout.bouts.fighter_a_name/club` продолжают показывать имя/клуб,
  под которым бой был фактически проведён (могли принадлежать source, а не
  target, если у них разные имена/клубы). Это может выглядеть как
  нестыковка в журнале боя («боец X» в истории, хотя ростер показывает
  результат за «бойца Y»). Альтернатива (переписывать снапшот на текущие
  имя/клуб target) отклонена: журнал боя — исторический факт, переписывать
  его задним числом хуже, чем оставить сноску несовпадения; если это
  окажется UX-проблемой — отдельное решение при код-ревью реализации, не
  меняющее модель данных.
- **`stage.withdrawn_seeds` не убирается TTL/cron.** Если боец выведен
  бессрочно (никогда не возвращён), запись остаётся навсегда — объём
  ограничен количеством выводов, не растёт быстро; явного решения об
  устаревании не требуется, но стоит держать в уме при код-ревью репо-слоя.

# Plan: Бои внутри пула (формирование пар)

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: draft
- Дата: 2026-07-15
- Спека: `./spec.md`

## Обзор решения

Новый серверный модуль `bout` (bounded context, своя PG-схема `bout`) —
mutable, не event-sourced (симметрично решению spec 0009 №17 для `pool`).
Бои не хранят собственного жизненного цикла в этой фиче — только пары
бойцов + порядок; следующие инкременты добавят статус/результат миграцией,
без переезда данных (NFR-2).

**Направление межмодульной зависимости — `pool → bout`, и только оно.** При
обсуждении спеки предполагалось «bout → pool» (по аналогии с `pool →
fighter`), но на этапе проработки алгоритма выяснилось, что это не нужно и
усложняет картину: `pool.Service.SetStatus` уже знает точный состав каждого
пула на момент фиксации (`draft → ready`) — он сам вызывает порт
`pool/domain.BoutGenerator` и передаёт готовый список бойцов пула **со
снапшотом имени/клуба** (у pool это уже есть после обогащения через
`ActiveFightersProvider`, спека 0009). Модуль `bout` эти данные просто
сохраняет — ему не нужно ничего запрашивать ни у `pool`, ни у `fighter`.
Итог: `bout` вообще ни от кого не зависит (кроме своей PG-схемы), `pool`
зависит от `bout` через порт — совершенно симметрично уже существующему
`pool → fighter`. Обратной зависимости, циклов, кросс-схемных запросов нет
(ADR 0002).

Триггер — существующий RPC `PoolAdminService.SetLayoutStatus` (0009, FR-9):

- `draft → ready`: **сначала** формируем бои (`BoutGenerator.
  GenerateForNomination`), **затем**, если успешно, пишем новый статус
  (`repo.SetStatus`). Если формирование упало — статус раскладки не меняется
  вообще (транзакция-по-порядку вместо распределённой транзакции — cхемы
  разные, единой БД-транзакции между `pool` и `bout` быть не может, ADR 0002).
- `ready → draft`: **сначала** чистим бои (`BoutGenerator.
  ClearForNomination`), **затем** статус. Если очистка упала — статус
  остаётся `ready` (бои технически ещё есть — консистентно, просто
  операция не удалась, admin увидит ошибку и может повторить).
- Порядок «сначала эффект в bout, потом статус в pool» **самовосстанавливается**
  при повторной попытке: `GenerateForNomination`/`ClearForNomination`
  реализованы как idempotent replace (удалить все бои номинации + вставить
  новые, единой транзакцией в схеме `bout`) — «осиротевшие» бои от неудачной
  попытки перезатираются следующим успешным вызовом. Явного компенсирующего
  отката статуса не требуется (см. «Риски»).
- Повторный вызов `SetLayoutStatus` с уже текущим статусом (draft→draft,
  ready→ready) не триггерит generate/clear — это не переход (FR-2 говорит
  именно про переход).

## Контракты (proto)

- Файл: `proto/hema/v1/bout.proto` (новый)
- Сервис: `BoutAdminService` — `RequireAdmin` (как `PoolAdminService`,
  `ArenaAdminService`). Публичного сервиса нет (FR-8).
- RPC:
  - `ListBoutsByNomination(ListBoutsByNominationRequest) →
    ListBoutsByNominationResponse` — плоский список боёв всех пулов
    номинации, отсортированный по `pool_id, sequence_number`; клиент
    группирует по `pool_id` (пулы уже известны из `PoolAdminService.
    GetLayout`, второй запрос на экран — NFR-1 из 0009 не переиспользуем
    буквально, т.к. это отдельный ресурс, но остаётся один запрос на весь
    список боёв номинации, не на пул).
- Сообщения:
  - `FighterRef { string fighter_id = 1; string name = 2; string club = 3; }`
    — снапшот на момент формирования (спека, «Принятые решения» №5).
  - `Bout { string id = 1; string pool_id = 2; string nomination_id = 3;
    int32 round_number = 4; int32 sequence_number = 5; FighterRef fighter_a
    = 6; FighterRef fighter_b = 7; }` — `round_number` = тур (FR-3a,
    инвариант «не дважды в туре»), `sequence_number` = итоговый порядок
    исполнения в пуле, 1..N (FR-3a/FR-3b), уникален в пределах `pool_id`.
  - `ListBoutsByNominationRequest { string nomination_id = 1; }`
  - `ListBoutsByNominationResponse { repeated Bout bouts = 1; }`

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

### Новый модуль `modules/bout/`

- PG-схема: `bout` (своя, миграция создаёт схему).
- `domain/`:
  - `FighterRef { ID, Name, Club string }` — собственная копия, не шарится с
    `pool`/`fighter` (ADR 0002).
  - `Bout { ID, PoolID, NominationID string; RoundNumber, SequenceNumber int;
    FighterA, FighterB FighterRef }`.
  - `PoolInput { PoolID string; Fighters []FighterRef }` — вход генерации:
    состав одного пула на момент фиксации (порядок `Fighters` неважен,
    функция сортирует сама).
  - Доменные ошибки: `ErrInvalidInput`.
  - **Чистая функция** `GenerateRoundRobin(fighters []FighterRef) []Pairing`
    (`Pairing{RoundNumber, SequenceNumber int; A, B FighterRef}`),
    юнит-тестируемая без БД (NFR-1-подобно 0009's `AutoDistribute`):
    1. `len(fighters) < 2` → пусто (FR-4).
    2. Канонический порядок — сортировка по `ID` asc (детерминизм, FR-7).
    3. **Круговой метод** (circle method, стандартный алгоритм round-robin):
       фиксируем первого участника, вращаем остальных; нечётное число —
       добавляем виртуального «бай»-участника, бои с ним не эмитятся. Даёт
       туры: внутри тура — паросочетание, каждый участник максимум один раз
       (жёсткий инвариант FR-3a, AC-9, выполняется для любого N по
       построению метода).
    4. **Эвристика минимизации стыков** (FR-3b) поверх порядка туров: при
       переходе к следующему туру выбираем **первым** тот его бой, что не
       делит бойцов с **последним** боем предыдущего тура — если такой бой
       в следующем туре есть, ставим его первым (переставляем бои внутри
       тура), остальные бои тура — в детерминированном порядке (по
       наименьшему `ID` бойца). Если такого боя нет (доказано для N=3,4 —
       AC-10, его нет никогда) — тур остаётся в базовом порядке.
       Для N≥6 такой бой гарантированно существует на каждом стыке (доказано
       для spec: между двумя разными паросочетаниями на ≥6 вершинах всегда
       есть непересекающаяся пара) — эвристика обязана дать 0 стыков
       (AC-11); тест это проверяет программно для набора N, а не хардкодит
       один пример руками (риск ошибки — см. «Риски»).
  - `Repository` (порт):
    - `ReplaceForNomination(ctx, nominationID string, bouts []Bout) error` —
      одной транзакцией: `DELETE ... WHERE nomination_id = $1` +
      bulk-`INSERT` новых `bouts` (`bouts == nil` → только удаление, это и
      есть «очистить», используется для обоих направлений: generate и clear
      реализованы через один и тот же repo-метод с разным входом).
    - `ListByNomination(ctx, nominationID string) ([]Bout, error)` —
      `ORDER BY pool_id, sequence_number`.
- `service/`:
  - `GenerateForNomination(ctx, nominationID string, pools []PoolInput)
    error` — для каждого `PoolInput` вызывает `domain.GenerateRoundRobin`,
    собирает все `Bout` всех пулов номинации, один вызов
    `repo.ReplaceForNomination`.
  - `ClearForNomination(ctx, nominationID string) error` —
    `repo.ReplaceForNomination(ctx, nominationID, nil)`.
  - `ListByNomination(ctx, nominationID string) ([]Bout, error)` —
    passthrough к репо (снапшот, без реконсиляции — см. spec «Вне скоупа»).
- `api/`: Connect-хендлер `BoutAdminService`, маппинг proto↔domain,
  `ErrInvalidInput` → `InvalidArgument`, прочее → `Internal`.
- `migrations/00001_init.sql` (goose Up/Down):

```sql
CREATE SCHEMA IF NOT EXISTS bout;

-- bouts — один бой = пара бойцов внутри пула + место в порядке проведения.
-- Без FK на pool.pools (кросс-схемные FK запрещены, ADR 0002) — pool_id
-- денормализован как обычный UUID; nomination_id тоже денормализован, чтобы
-- ReplaceForNomination мог удалять «все бои номинации» одним запросом без
-- join на схему pool. Имя/клуб бойца в этой таблице не хранится отдельно —
-- см. bout_fighters ниже (снапшот на момент формирования, спека решение №5).
CREATE TABLE bout.bouts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id          UUID NOT NULL,
    nomination_id    UUID NOT NULL,
    round_number     INTEGER NOT NULL,
    sequence_number  INTEGER NOT NULL,
    fighter_a_id     UUID NOT NULL,
    fighter_a_name   TEXT NOT NULL,
    fighter_a_club   TEXT NOT NULL DEFAULT '',
    fighter_b_id     UUID NOT NULL,
    fighter_b_name   TEXT NOT NULL,
    fighter_b_club   TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_bouts_distinct_fighters CHECK (fighter_a_id <> fighter_b_id),
    CONSTRAINT chk_bouts_round_positive    CHECK (round_number >= 1),
    CONSTRAINT chk_bouts_sequence_positive CHECK (sequence_number >= 1),
    CONSTRAINT uq_bouts_pool_sequence UNIQUE (pool_id, sequence_number)
);
CREATE INDEX idx_bouts_pool_sequence ON bout.bouts (pool_id, sequence_number);
CREATE INDEX idx_bouts_nomination    ON bout.bouts (nomination_id);
```

  Down: `DROP TABLE bout.bouts; DROP SCHEMA bout;`.

  Имя/клуб бойца хранятся **денормализованными прямо в `bouts`** (не
  отдельной таблицей — пара «имя+клуб» неотделима от конкретного боя и не
  переиспользуется между боями, отдельная таблица дала бы только лишний
  join без выгоды).

- `Register(mux, deps, baseOpts, adminOpts)` — `Deps{ Pool *pgxpool.Pool }`
  (никаких межмодульных портов — bout ни от кого не зависит, см. «Обзор»).

### Изменения модуля `pool`

- `domain/domain.go`:
  - Новый порт `BoutGenerator`:
    ```go
    type BoutPoolInput struct {
        PoolID   string
        Fighters []FighterRef // существующий тип pool.domain.FighterRef
    }
    type BoutGenerator interface {
        GenerateForNomination(ctx context.Context, nominationID string, pools []BoutPoolInput) error
        ClearForNomination(ctx context.Context, nominationID string) error
    }
    ```
- `service/service.go`:
  - `Service` получает поле `bouts domain.BoutGenerator`, `New(repo, fighters,
    bouts)`.
  - `SetStatus` переписывается на порядок «эффект в bout → потом статус»:
    ```go
    func (s *Service) SetStatus(ctx context.Context, nominationID string, status domain.LayoutStatus) (domain.Layout, error) {
        nominationID = strings.TrimSpace(nominationID)
        if nominationID == "" || (status != domain.LayoutDraft && status != domain.LayoutReady) {
            return domain.Layout{}, domain.ErrInvalidInput
        }
        current, err := s.loadLayout(ctx, nominationID)
        if err != nil {
            return domain.Layout{}, err
        }
        switch {
        case current.Status == domain.LayoutDraft && status == domain.LayoutReady:
            if err := s.bouts.GenerateForNomination(ctx, nominationID, toBoutPools(current.Pools)); err != nil {
                return domain.Layout{}, err
            }
        case current.Status == domain.LayoutReady && status == domain.LayoutDraft:
            if err := s.bouts.ClearForNomination(ctx, nominationID); err != nil {
                return domain.Layout{}, err
            }
        }
        if err := s.repo.SetStatus(ctx, nominationID, status); err != nil {
            return domain.Layout{}, err
        }
        return s.loadLayout(ctx, nominationID)
    }
    ```
  - `toBoutPools([]domain.Pool) []domain.BoutPoolInput` — тривиальный маппинг
    (`PoolID: p.ID, Fighters: p.Members`), т.к. `loadLayout` уже отдаёт
    `Pool.Members` обогащёнными и отфильтрованными до активных (FR-12, спека
    0009) — ровно то, что нужно на вход генерации.
- Тесты `service_test.go` расширяются: `SetStatus(ready)` вызывает
  `BoutGenerator.GenerateForNomination` с правильным составом каждого пула;
  `SetStatus(draft)` из `ready` вызывает `ClearForNomination`; повторный
  `SetStatus` с тем же статусом порт вообще не дёргает; ошибка от
  `BoutGenerator` пробрасывается, `repo.SetStatus` при этом **не
  вызывается** (порядок — см. «Обзор»).

### Wiring (`internal/platform`)

- `internal/platform/bout_generator.go` (новый) — адаптер
  `PoolBoutGenerator` к порту `pool/domain.BoutGenerator`, строит
  собственный `boutservice.Service` поверх `boutrepo.New(pool)` (по образцу
  `PoolActiveFightersProvider`, не переиспользует HTTP-инстанс из
  `bout.Register`).
- `platform.go`:
  ```go
  boutDeps := boutmodule.Deps{Pool: pool}
  boutmodule.Register(mux, boutDeps, baseOpts, adminOpts)

  poolDeps := poolmodule.Deps{
      Pool:     pool,
      Fighters: NewPoolActiveFightersProvider(pool),
      Bouts:    NewPoolBoutGenerator(pool),
  }
  poolmodule.Register(mux, poolDeps, baseOpts, adminOpts)
  ```

### Синхронизация инфраструктурных точек (новый модуль, см. `server/AGENTS.md`)

- `server/sqlc.yaml` — секция `bout` (schema `modules/bout/migrations`,
  queries `modules/bout/repo/queries`, out `modules/bout/repo/sqlc`).
- `server/internal/testdb/testdb.go` — `{"bout", moduleDir("bout")}` в
  `moduleMigrations`.
- Корневой `Makefile` — `BOUT_MIGRATIONS_DIR`, добавить в цели
  `migrate`/`migrate-down` (по образцу `POOL_MIGRATIONS_DIR`).
- `server/Dockerfile` — `COPY --from=build /src/modules/bout/migrations
  /app/modules/bout/migrations`.
- Проверка миграций в полном `docker compose up --build` + `\dn` — часть DoD
  (`AGENTS.md`), выполняется на этапе `tdd-cycle`, не в этом плане.

## Web (FSD + BFF)

- BFF: `app/api/nominations/[id]/bouts/route.ts` (GET, Node runtime) →
  `BoutAdminService.ListBoutsByNomination`, требует admin-сессию, маппинг
  `connect.Code` → HTTP (реюз `lib/grpc`, как остальные pool-ручки).
- `entities/bout/lib/types.ts` — `Bout`, `FighterRef` (из proto), группировка
  по `pool_id` — вспомогательный helper `groupBoutsByPool`.
- `features/nomination-pools/`:
  - `api/keys.ts` — `bouts(nominationId)`.
  - `api/requests.ts` — `fetchBouts(nominationId)`.
  - `api/use-bouts.ts` — RQ-хук, **`enabled: layout?.status ===
    "POOL_LAYOUT_STATUS_READY"`** (защита в глубину: даже если бои остались
    в БД из-за неатомарности — «Риски» — экран их не покажет вне `ready`,
    что и требует AC-5).
  - `ui/nomination-pools.tsx` — в карточке пула (когда `readOnly`, т.е.
    `ready`) под списком бойцов рендерится список боёв этого пула
    (сгруппированных `use-bouts` по `pool_id`), в порядке
    `sequence_number`: `«Тур {round_number}: {fighter_a.name} — 
    {fighter_b.name}»`.
- Роут-страница не меняется (`pools/page.tsx` уже есть, 0009).
- Тесты (Vitest): BFF route (`.e2e.test.ts`, реальный proto→JSON, мок
  transport), `use-bouts` (мок `fetch`), `groupBoutsByPool` (чистая функция).

## События

> Placeholder (0009-подобно). EDD не вводится.

- Издаёт: нет.
- Потребляет: нет. `pool → bout` — синхронный in-process вызов через порт,
  не событие (см. «Обзор»).

## Тестирование

- Юнит (`bout/domain`): `GenerateRoundRobin` — таблица кейсов **по формулам,
  не только руками подобранным примерам** (см. «Риски»): для N = 0..10
  проверяются программно инварианты AC-9 (внутри тура не дважды),
  AC-13/FR-7 (все `C(n,2)` пар присутствуют ровно по разу, детерминизм при
  повторном запуске), а также точечно — AC-10 (N=3 и N=4: посчитать реальное
  число «плохих» стыков и сравнить с математически доказанным минимумом: оба
  стыка плохие в обоих случаях) и AC-11 (N=6: ноль плохих стыков).
- Юнит (`bout/service`, fake-репо): `GenerateForNomination` собирает бои всех
  пулов одним вызовом `ReplaceForNomination`; `ClearForNomination` зовёт его
  же с `nil`; `ListByNomination` — passthrough.
- E2E ручек (`bout/api`, httptest+Connect, fake-репо): `ListBoutsByNomination`
  — happy path + admin-guard.
- Интеграционные (`bout/integration`, testcontainers): миграции применяются;
  `ReplaceForNomination` транзакционно (delete+insert); `UNIQUE(pool_id,
  sequence_number)` держит инвариант.
- Юнит (`pool/service`, расширение): см. выше — вызовы `BoutGenerator` в
  правильном порядке/составе/условиях, включая «ошибка генерации не меняет
  статус».
- `pool/testutil`: новый `FakeBoutGenerator` (spy: фиксирует
  вызовы+аргументы, настраиваемая ошибка) — для тестов service.
- Web (Vitest): см. выше.

## Риски и открытые вопросы

- **Не единая транзакция между схемами `pool` и `bout`** (ADR 0002 —
  отдельные PG-схемы на модуль). Смягчено порядком операций «эффект в bout
  → потом статус в pool» (см. «Обзор»): при отказе на любом шаге видимое
  состояние остаётся консистентным (либо старое, либо новое, никогда
  «наполовину») **с точностью до одного edge-case** — если
  `ClearForNomination`/`GenerateForNomination` в `bout`-схеме уже
  закоммитились, а последующий `repo.SetStatus` в `pool`-схеме упал (сеть/БД
  между двумя вызовами), статус останется прежним, а бои — уже
  изменёнными. Следующий успешный вызов `SetLayoutStatus` перезапишет бои
  заново (`ReplaceForNomination` идемпотентен) — самолечится, но короткое
  окно рассинхронизации теоретически возможно. Осознанный компромисс
  (вероятность мала: два локальных вызова к той же БД подряд), не
  усложняем компенсирующими транзакциями ради него.
- **Круговой метод + эвристика стыков — на грани мат. доказательства, не
  просто «здравого смысла»** (как и `AutoDistribute` в 0009, но здесь ещё и
  ошиблись один раз при ручном подсчёте на этапе спеки — AC-9 пришлось
  переформулировать). Тесты **обязаны** проверять инварианты программно по
  диапазону N (см. «Тестирование»), не полагаться на 1-2 руками посчитанных
  примера — риск повторить ту же ошибку.
- **Снапшот имени/клуба бойца в `bout.bouts`** — не реагирует на
  последующее редактирование бойца (клуб/имя) без повторной генерации
  (возврат в `draft` + снова `ready`). Соответствует spec: полноценная
  реакция на изменения бойца после фиксации — вне скоупа (спека, «Вне
  скоупа»).
- **`sequence_number`/`round_number` как явные INT-колонки**, а не
  вычисляемый порядок — сделано ради простого `ORDER BY` на чтении и
  `UNIQUE(pool_id, sequence_number)` как проверяемого на уровне БД
  инварианта; альтернатива (хранить только массив id) потребовала бы
  парсинга JSONB на каждом чтении без выгоды.

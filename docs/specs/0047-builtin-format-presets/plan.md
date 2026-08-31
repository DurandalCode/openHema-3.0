# Plan: Встроенный каталог пресетов формата

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: ready
- Дата: 2026-08-31
- Спека: `./spec.md`

## Обзор решения

Каталог — **константа домена** (`stage/domain/catalogue.go`): десять записей
`BuiltinPreset{Key, Name, Spec}`, где `Spec` — та же `domain.FormatSpec`, что
у пользовательского пресета (0020). Новых понятий модель не получает: запись
каталога отличается от пользовательского пресета только тем, что её текст
лежит в коде, а не в базе.

Заведение — **бутстрап при старте** по образцу первого админа (ADR 0007,
`auth.Bootstrap`): `stage.BootstrapPresets` вызывается из composition root
рядом с `auth.Bootstrap`, ошибку только логирует (NFR-2). Однократность
(FR-7) обеспечивает **журнал заведения** — отдельная таблица
`stage.builtin_preset_seeds(preset_key)`, переживающая удаление самого
пресета: колонка на `stage.format_presets` умерла бы вместе со строкой, и
удалённый пресет воскресал бы при каждом старте.

Восстановление (FR-10) — тот же код заведения, вызванный **мимо журнала**:
новый admin-RPC `RestoreBuiltinPresets` и кнопка в библиотеке форматов. И
автоматический, и явный путь пропускают запись с занятым именем (FR-9), опираясь
на существующий `ErrPresetNameTaken` (0020) вместо отдельной проверки.

Применение встроенного пресета нового кода не требует вовсе: `ApplyFormat`
(0020, FR-13) не знает и не должен знать о происхождении записи.

## Контракты (proto)

- Файл: `proto/hema/v1/stage.proto`
- Сервис: `StageAdminService` (существующий, admin-only через `RequireAdmin`
  в `module.Register`, ADR 0007)
- RPC: `RestoreBuiltinPresets(RestoreBuiltinPresetsRequest) → RestoreBuiltinPresetsResponse`
- Сообщения:
  - `RestoreBuiltinPresetsRequest {}` — параметров нет: каталог глобален, как
    и библиотека (0020, `ListFormatPresetsRequest`)
  - `RestoreBuiltinPresetsResponse { repeated FormatPreset restored = 1; int32 skipped = 2; }`
    — `restored` отдаёт заведённые записи целиком (клиент кладёт их в кеш
    библиотеки без дополнительного запроса), `skipped` — сколько пропущено по
    занятому имени (FR-9/FR-10: действие обязано отчитаться обо обоих числах)
- Новых enum, полей в `FormatPreset` и `FormatStageSpec` — **нет**: пометки
  «встроенный» в контракте не появляется (FR-5), происхождение наружу не
  выходит.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

- Модуль: `modules/stage/` — расширение (схема и пресеты живут здесь, ADR
  0014 §8). Межмодульных зависимостей фича не добавляет.
- PG-схема: `stage` (существующая)
- Слои:
  - `domain/catalogue.go` — **новый файл**, чистые данные + конструкторы:
    ```go
    type BuiltinPreset struct {
        Key  string      // стабильный ключ записи каталога (журнал, FR-7)
        Name string      // имя в библиотеке (FR-4)
        Spec FormatSpec  // та же спецификация, что у пользовательского пресета
    }
    func BuiltinPresets() []BuiltinPreset
    ```
    Ключи стабильны навсегда — по ним журнал отличает «эта запись уже
    заводилась» от «эта запись новая в версии» (FR-8). Переименование записи
    в каталоге ключ не меняет; изменение схемы существующего ключа
    запрещено смыслом FR-7 (исправленная схема — **новый ключ**).

    Десять записей (spec FR-2/FR-3), собираются тремя приватными
    конструкторами `groupsDoublePlayoff(n, size)`, `groupsPlayoff(n, size)`,
    `singleBracket(size)` + одна литеральная `roundRobin()`:

    | Ключ                        | Имя                                  | Этапы (`FormatStageSpec`)                                                                                                            |
    | --------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
    | `groups-double-playoff-8`   | Группы + двойной плейофф (до 8)      | `[0]` Групповой этап, GROUPS, groups=2, roster/ALL/SNAKE · `[1]` Основная сетка, BRACKET, size=4, third=true, stage 0/GROUP_PLACES 1–2/SEEDED · `[2]` Утешительная сетка, BRACKET, size=4, third=true, stage 0/GROUP_PLACES 3–0/SEEDED |
    | `groups-double-playoff-16`  | Группы + двойной плейофф (до 16)     | то же, groups=4, size=8                                                                                                                |
    | `groups-double-playoff-32`  | Группы + двойной плейофф (до 32)     | то же, groups=8, size=16                                                                                                               |
    | `groups-playoff-8`          | Группы + плейофф (до 8)              | `[0]` + `[1]` из двойного, groups=2, size=4                                                                                            |
    | `groups-playoff-16`         | Группы + плейофф (до 16)             | groups=4, size=8                                                                                                                       |
    | `groups-playoff-32`         | Группы + плейофф (до 32)             | groups=8, size=16                                                                                                                      |
    | `bracket-8`                 | Олимпийка (до 8)                     | `[0]` Сетка, BRACKET, size=4, third=true, roster/ALL/SEEDED                                                                            |
    | `bracket-16`                | Олимпийка (до 16)                    | size=8                                                                                                                                 |
    | `bracket-32`                | Олимпийка (до 32)                    | size=16                                                                                                                                |
    | `round-robin`               | Круговая система (одна группа)       | `[0]` Круговая система, GROUPS, groups=1, roster/ALL/SNAKE                                                                             |

    `PlaceTo = 0` в утешительной ветке — открытая верхняя граница «3 и ниже»
    (0019, FR-3), она же гарантирует непересечение с окном 1–2 (0019, FR-11).
    `Method` проставляется явно (SNAKE в группы, SEEDED в сетку) — тем же
    значением, которое сервер вывел бы сам (0019, FR-4), чтобы спецификация
    каталога совпадала с той, что даёт `SpecFromStages` на применённой схеме.
  - `domain/domain.go` — две новые операции в порту `Repository` (рядом с
    пресетными, 0020):
    ```go
    SeededPresetKeys(ctx context.Context) ([]string, error)
    MarkPresetSeeded(ctx context.Context, key string) error
    ```
    Новых доменных ошибок нет: конфликт имени — существующий
    `ErrPresetNameTaken`, неисполнимая спецификация — `ErrInvalidSpec`.
  - `service/catalogue.go` — **новый файл**, два юзкейса поверх одного
    внутреннего прохода:
    ```go
    type SeedReport struct{ Restored []domain.FormatPreset; Skipped int }
    func (s *Service) SeedBuiltinPresets(ctx) (SeedReport, error)     // FR-6..FR-9
    func (s *Service) RestoreBuiltinPresets(ctx) (SeedReport, error)  // FR-10
    ```
    Проход по записям каталога: `ValidateFormatSpec` (защита от битой записи,
    NFR-1/NFR-3) → `InsertFormatPreset` → `MarkPresetSeeded`. Разница ровно
    одна: `Seed` сначала вычитает `SeededPresetKeys` и пропускает known-ключи
    (FR-7/FR-8), `Restore` журнал игнорирует и пробует всё (FR-10). В обоих
    путях `ErrPresetNameTaken` — не ошибка, а `Skipped++` (FR-9); ключ при
    этом **всё равно отмечается в журнале**: попытка была, и повторять её при
    каждом старте система не должна. Прочая ошибка репозитория прерывает
    проход и возвращается наверх (в бутстрапе — только в лог, NFR-2).
  - `repo/queries/stage.sql` — два запроса:
    ```sql
    -- name: ListSeededPresetKeys :many
    SELECT preset_key FROM stage.builtin_preset_seeds;
    -- name: MarkPresetSeeded :exec
    INSERT INTO stage.builtin_preset_seeds (preset_key) VALUES ($1)
    ON CONFLICT (preset_key) DO NOTHING;
    ```
    `repo/repo.go` — реализация двух методов порта. Отдельного запроса «имя
    занято» нет: занятость определяет уникальный индекс `uq_presets_name`
    (миграция 00004) через существующий маппинг в `ErrPresetNameTaken`.
  - `api/handler.go` — `RestoreBuiltinPresets`: вызов сервиса, маппинг
    `SeedReport` → proto (`restored` через существующий `toProtoFormatPreset`,
    `skipped` числом). Ошибка сервиса → `connect.CodeInternal` (доменных
    отказов у действия нет: конфликт имени — не отказ, а `skipped`).
  - `migrations/00006_builtin_presets.sql` (goose):
    ```sql
    -- +goose Up
    CREATE TABLE stage.builtin_preset_seeds (
        preset_key TEXT PRIMARY KEY,
        seeded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_seed_key CHECK (length(btrim(preset_key)) > 0)
    );
    -- +goose Down
    DROP TABLE IF EXISTS stage.builtin_preset_seeds;
    ```
    **Зачем отдельная таблица, а не колонка `builtin_key` на
    `stage.format_presets`:** журнал обязан пережить удаление пресета (FR-7) —
    колонка исчезла бы вместе со строкой, и удалённая запись заводилась бы
    заново при каждом старте. Ни FK, ни ссылки на `format_presets` у журнала
    нет намеренно: он про **факт попытки заведения ключа**, а не про
    существующую строку. Данными миграция не сеет: каталог — Go-константа, и
    дублировать его текст в SQL значило бы завести второй источник истины
    (правило `AGENTS.md` №1 по духу).
- Регистрация: `modules/stage/module.go` — новая точка входа рядом с
  `Register`, по образцу `auth.Bootstrap`:
  ```go
  func BootstrapPresets(ctx context.Context, deps Deps, log *slog.Logger)
  ```
  собирает `repo.New(deps.Pool)` + `service.New(...)`, вызывает
  `SeedBuiltinPresets`, логирует `seeded/skipped` либо ошибку. Вызов — в
  `internal/platform/platform.go` рядом с `auth.Bootstrap(...)`.
- Межмодульные зависимости: нет.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

- BFF: `app/api/formats/restore/route.ts` — `POST`, Node runtime; берёт
  access-токен из cookies, зовёт `stageAdminClient.restoreBuiltinPresets({})`,
  отдаёт `{ restored: FormatPreset[], skipped: number }` через существующий
  `formatPresetsToJson`; ошибки — существующий `errorResponse` (401 без
  токена, как в `app/api/formats/route.ts`).
- Слои:
  - `entities/stage/` — без изменений: тип `FormatPreset` уже есть, новых
    полей контракт не вводит.
  - `features/format-presets/api/requests.ts` — `restoreBuiltinPresets()`
    поверх `apiFetch`; `use-restore-builtin-presets.ts` — мутация TanStack
    Query, на успех `invalidateQueries` по существующему ключу библиотеки
    (`keys.ts`), сообщение об отказе — через существующий `presetErrorMessage`
    (0031, FR-27).
  - `features/format-presets/ui/preset-library.tsx` — кнопка «Восстановить
    встроенные» в действиях `PageHeader` (рядом со ссылкой на номинации);
    успех — `toastSuccess` с числами («Восстановлено 3, пропущено 1» /
    «Все встроенные пресеты уже в библиотеке» при `restored = 0`), отказ —
    `toastError` (правило 0023: постоянных `Alert`-баннеров не заводим).
  - `widgets/` — без изменений: `PresetChips` (0031) встроенные записи
    показывает как обычные (FR-5), кода это не требует.
- Server components vs client: `PresetLibrary` уже `"use client"`; страница
  `/admin/formats` не меняется.
- State: server-state → TanStack Query (библиотека пресетов уже там), новых
  Zustand-стора и локального состояния фича не вводит.

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей). Если фиче нужны доменные события — отметить здесь, что
> потребуется, и не реализовывать до принятия EDD-ADR.

- Издаёт: нет
- Потребляет: нет

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- Юнит (`domain/catalogue_test.go`): каталог из десяти записей; ключи и имена
  уникальны; **каждая** запись проходит `ValidateFormatSpec` (NFR-1); целевая
  схема имеет ожидаемую форму — три этапа, два `bracket` от индекса 0 с
  окнами 1–2 и 3–0, вместимость сетки равна отбору (`2 × groupCount == size`,
  AC-3); имена содержат вариант масштаба (AC-1).
- Юнит (`service/catalogue_test.go`, fake-репо из `testutil`): пустая
  библиотека → заведено 10, журнал содержит 10 ключей (AC-1); повторный вызов
  → 0 заведено (FR-7); ключ в журнале, а пресета нет (удалён) → не
  восстанавливается (AC-6); новый ключ при непустом журнале → заводится
  только он (AC-8); занятое имя → `Skipped++`, чужой пресет не изменён,
  проход продолжается (AC-9); `RestoreBuiltinPresets` при непустом журнале
  заводит недостающие и не трогает существующие (AC-10, AC-11); ошибка репо
  (не `ErrPresetNameTaken`) прерывает проход и возвращается (AC-13).
- Юнит (`service/schema_test.go`, дополнение): применение спецификации
  целевой записи каталога к номинации даёт три этапа с ожидаемыми
  позициями/правилами, а `Diagnose` по ним не содержит проблем класса
  `ERROR` (AC-2, AC-3, NFR-1).
- E2E ручек (`api/handler_test.go`, httptest + Connect, fake-репо):
  `RestoreBuiltinPresets` — счастливый путь (`restored`/`skipped` в ответе),
  admin-only обеспечен существующим интерсептором (отдельного теста роли не
  заводим — он уже есть на уровне сервиса).
- Интеграционные с БД (`integration/`): миграция 00006 применяется;
  `MarkPresetSeeded` + `DeleteFormatPreset` — запись журнала переживает
  удаление пресета (ключевое свойство выбора «отдельная таблица», FR-7);
  `ON CONFLICT DO NOTHING` идемпотентен.
- Web (Vitest): `app/api/formats/restore/route.test.ts` — 401 без токена,
  проксирование ответа, маппинг `connect.Code` → HTTP; `requests.test.ts` —
  фетчер; `preset-library.test.tsx` — кнопка вызывает мутацию, тост с
  числами, тост «уже в библиотеке» при `restored = 0`.

## Риски и открытые вопросы

- **Отметка журнала при пропуске по имени** (FR-9): выбрано «отметить и не
  повторять». Иначе каждый старт сервера тратился бы на заведомо
  проваливающуюся вставку, а организатор, освободивший имя через полгода,
  получил бы неожиданное появление пресета. Цена: освободив имя, встроенную
  запись возвращают явным восстановлением (FR-10) — то самое действие, ради
  которого оно и заведено.
- **`Diagnose` над утешительной веткой**: окно «3 и ниже» открыто сверху, и
  верхняя граница отбора из схемы не выводится — вероятен класс
  `WARNING`/`INFO` (недобор в сетку), но не `ERROR`. Тест NFR-1 проверяет
  именно отсутствие `ERROR`; если какая-то запись каталога всё же даёт
  ошибку, правится **запись каталога**, а не диагностика.
- **Первый запуск на существующей инсталляции** (препрод, ADR/спека 0046):
  библиотека там уже может быть непустой. Поведение то же, что на свежей
  (FR-6/FR-9): каталог заводится целиком, конфликтующие по имени записи
  пропускаются. Отдельного «режима миграции» не нужно.
- **Порядок в библиотеке** остаётся алфавитным (0029, FR-20): каталог
  вклинивается в общий список, встроенные записи наверх не всплывают — это
  прямое следствие FR-5, а не недосмотр.

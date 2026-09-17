# Plan: Импорт бойцов из файла

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-09-17
- Спека: `./spec.md`

## Обзор решения

Расширение существующего модуля `fighter` одним синхронным RPC
`ImportFighters` с флагом `dry_run` — новых модулей и новых таблиц фича не
вводит: импортированный боец это обычный боец 0007, а предпросмотр это тот же
разбор без записи.

**Файл разбирается на Go-сервере, не в BFF.** BFF по `web/AGENTS.md` — тонкий
слой «REST наружу, gRPC внутрь + проброс токена»; вся содержательная часть
фичи (сопоставление названий номинаций, дедуп по имени+клубу, схлопывание
дублей внутри файла, исход каждой строки) — доменные правила, и им место
рядом с `fighter/service`, где уже живёт дедуп по `origin_user_id`. BFF
делает ровно то же, что уже делает `app/api/tournament/files/[kind]/route.ts`:
`multipart/form-data` → `bytes`, гейт по типу и размеру, вызов Connect-клиента.

**Двухшаговость без состояния на сервере.** `dry_run=true` и `dry_run=false` —
один и тот же RPC с одним и тем же телом; файл между шагами живёт в браузере
и отправляется повторно. Ни таблицы «сессий импорта», ни объектного
хранилища (NFR-3) не появляется. Цена — двойной разбор файла; при лимите в
1000 строк это доли секунды.

**Ядро — чистая функция.** `domain.PlanImport(rows, existing, nominations,
defaults) → []RowResult` не знает ни про БД, ни про формат файла: на входе
разобранные строки, снимок ростера и индекс номинаций, на выходе — исход
каждой строки. Вся матрица случаев спеки (новый / дополнение / пропуск /
отклонение, дубль внутри файла, выведенный боец, слитая запись) проверяется
табличными юнит-тестами без контейнеров.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

- Файл: `proto/hema/v1/fighter.proto`
- Сервис: `FighterAdminService` — один новый RPC (весь сервис уже под
  `RequireAdmin`, отдельной защиты не нужно — FR-12).

```proto
// ImportFighters разбирает файл со списком участников и заводит бойцов
// (спека 0049). dry_run=true возвращает тот же отчёт, ничего не записав —
// предпросмотр (FR-2). Ошибки уровня файла (неизвестный формат, нет
// заголовка, превышен лимит) — connect.CodeInvalidArgument; ошибки уровня
// строки не ошибка RPC, а исход строки в отчёте (FR-9).
rpc ImportFighters(ImportFightersRequest) returns (ImportFightersResponse);
```

- Сообщения:

```proto
// ImportRowOutcome — исход одной строки файла.
enum ImportRowOutcome {
  IMPORT_ROW_OUTCOME_UNSPECIFIED = 0;
  IMPORT_ROW_OUTCOME_CREATED = 1;  // заведён новый боец
  IMPORT_ROW_OUTCOME_UPDATED = 2;  // существующему добавлены участия
  IMPORT_ROW_OUTCOME_SKIPPED = 3;  // полный дубль: ничего не меняется
  IMPORT_ROW_OUTCOME_REJECTED = 4; // строка не применена, см. error
}

// ImportRowError — причина отклонения строки (FR-6/FR-5/FR-8a).
enum ImportRowError {
  IMPORT_ROW_ERROR_UNSPECIFIED = 0;
  IMPORT_ROW_ERROR_EMPTY_NAME = 1;
  IMPORT_ROW_ERROR_UNKNOWN_NOMINATION = 2;
  IMPORT_ROW_ERROR_FIGHTER_WITHDRAWN = 3;
}

// ImportRowReport — строка отчёта: и предпросмотра, и результата.
message ImportRowReport {
  // line — номер строки в файле, как её видит admin в редакторе, с учётом
  // заголовка (FR-11a).
  int32 line = 1;
  string name = 2;
  string club = 3;
  ImportRowOutcome outcome = 4;
  // nomination_titles — номинации строки как они записаны в файле; пусто,
  // если колонка пуста и сработало умолчание из UI (FR-5a).
  repeated string nomination_titles = 5;
  // added_nomination_ids — участия, которые появятся (CREATED/UPDATED).
  repeated string added_nomination_ids = 6;
  // fighter_id — существующий боец для UPDATED/SKIPPED/REJECTED-withdrawn;
  // для CREATED при dry_run пуст (бойца ещё нет), после импорта заполнен.
  string fighter_id = 7;
  ImportRowError error = 8;
  // error_detail — уточнение: нераспознанное название номинации.
  string error_detail = 9;
}

message ImportSummary {
  int32 rows_read = 1;
  int32 created = 2;
  int32 updated = 3;
  int32 skipped = 4;
  int32 rejected = 5;
}

message ImportFightersRequest {
  // tournament_id опционален: пустой — активный турнир (как ListRoster).
  optional string tournament_id = 1;
  bytes content = 2;
  // file_name — по расширению (.csv/.xlsx) выбирается разборщик.
  string file_name = 3;
  // default_nomination_ids — применяются к строкам с пустой колонкой
  // номинаций (FR-5a).
  repeated string default_nomination_ids = 4;
  // dry_run — предпросмотр без записи (FR-2).
  bool dry_run = 5;
}

message ImportFightersResponse {
  ImportSummary summary = 1;
  repeated ImportRowReport rows = 2;
  // dry_run — эхо запроса: UI не должен путать предпросмотр с отчётом.
  bool dry_run = 3;
}
```

- `common.proto` не трогаем: новые enum'ы специфичны для импорта бойцов.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

- Модуль: `modules/fighter/` — **расширение**, нового bounded context нет.
- PG-схема: `fighter` — существующая, новых таблиц нет (импортированный боец
  это `fighter.fighters` + `fighter.participations`).

### `pkg/tabular/` (новый пакет, без бизнес-логики)

По `server/AGENTS.md` `pkg/` — переиспользуемое без доменных знаний. Здесь
живёт ровно «байты файла → таблица строк», ничего про бойцов:

- `tabular.Read(content []byte, fileName string) (Table, error)` — по
  расширению выбирает разборщик; `Table` = заголовок + строки `[]string` с
  исходными номерами строк.
- CSV: `encoding/csv` c автоопределением разделителя (`;` против `,` — Excel
  в русской локали пишет `;`) и кодировки: BOM UTF-8 → UTF-8; валидный
  UTF-8 → как есть; иначе windows-1251 через
  `golang.org/x/text/encoding/charmap` (NFR-2). `x/text` уже в `go.mod`
  косвенной зависимостью — становится прямой.
- XLSX: `github.com/xuri/excelize/v2` — **новая прямая зависимость**, первый
  лист книги. Альтернатива «разбирать XLSX в BFF через sheetjs» отвергнута:
  она разносит один разбор по двум языкам и утолщает BFF.
- Ошибки пакета: `ErrUnsupportedFormat`, `ErrEmptyFile`, `ErrTooManyRows`.
- Лимиты — параметры `Read`, не константы пакета: `MaxRows` (1000, NFR-1),
  размер файла режется раньше, в BFF и в api-слое.

### `domain/` — `modules/fighter/domain/import.go`

- `ImportRow{Line int, Name, Club string, NominationTitles []string}` —
  разобранная строка файла.
- `RowOutcome` (`created`/`updated`/`skipped`/`rejected`), `RowError`
  (`empty_name`/`unknown_nomination`/`fighter_withdrawn`),
  `RowResult{ImportRow, Outcome, Error, ErrorDetail, FighterID,
  AddedNominationIDs []string}`, `ImportSummary`.
- `NormalizeKey(name, club string) string` — ключ сопоставления FR-8:
  нижний регистр + схлопывание внутренних пробелов + trim. Одна функция на
  всё: ею строится и индекс существующих бойцов, и ключ строки файла, и
  ключ дедупа внутри файла (FR-7).
- `PlanImport(rows []ImportRow, existing []Fighter, noms map[string]string,
  defaults []string) ([]RowResult, ImportSummary)` — **чистая функция**,
  сердце фичи:
  - индекс существующих: `NormalizeKey` → боец; записи со `StatusMerged`
    в индекс не попадают (FR-8b);
  - `noms` — `lower(trim(title))` → `nomination_id`, построен вызывающим;
  - пустое имя → `rejected/empty_name` (FR-6);
  - нераспознанное название → `rejected/unknown_nomination` +
    `ErrorDetail` = само название (FR-5);
  - совпадение с `StatusWithdrawn` → `rejected/fighter_withdrawn` (FR-8a);
  - совпадение с активным: недостающие активные участия → `updated`,
    иначе `skipped` (FR-8, AC-5/AC-6);
  - нет совпадения → `created`; **вторая строка с тем же ключом не
    создаёт второго бойца**, а дополняет уже запланированного (FR-7,
    AC-7) — для этого функция ведёт «план создаваемых» наряду с индексом
    существующих;
  - пустой набор номинаций законен (FR-5b, AC-14);
  - `defaults` подставляются только при пустом `NominationTitles` (FR-5a).
- Порт `NominationProvider` расширяется вторым методом:
  `NominationsByTournament(ctx, tournamentID) ([]NominationRef, error)`,
  где `NominationRef{ID, Title string}` — резолв названий требует списка, а
  существующий `Nomination(ctx, id)` отдаёт только `TournamentID`.
- Порт `Repository` — без изменений. **Поправка, найденная при реализации:**
  `ListByTournament` с пустым `RosterFilter` снимка ростера НЕ даёт — после
  спеки 0041 `Limit` уходит в SQL как есть (`LIMIT sqlc.arg(row_limit)` без
  `NULLIF`), и `LIMIT 0` возвращает ноль строк. Снимок собирается страницами
  (`service.loadRoster`, по 500). `Create`/`Update` применяют план.

### `service/` — `modules/fighter/service/import.go`

`ImportFighters(ctx, cmd) (ImportResult, error)`:

1. турнир: `cmd.TournamentID`, иначе `ActiveTournamentProvider`;
2. `tabular.Read(cmd.Content, cmd.FileName)` → строки; ошибки пакета →
   доменные (`ErrUnsupportedFile`, `ErrEmptyFile`, `ErrTooManyRows`);
3. колонки: по заголовку (`имя`/`name`, `клуб`/`club`, `номинации`/
   `nominations`, регистр и пробелы не важны); отсутствие колонки имени →
   `ErrMissingNameColumn`. Порядок колонок в файле произволен, лишние
   колонки игнорируются; **настраиваемого маппинга нет** (вне скоупа);
4. номинации турнира через расширенный `NominationProvider` → индекс
   названий; `cmd.DefaultNominationIDs` проверяются на принадлежность
   турниру (чужой id → `ErrNominationNotFound`, это ошибка запроса, не
   строки — id приходит из UI, а не из файла);
5. ростер: `loadRoster` — страницами по 500 (см. поправку выше);
6. `domain.PlanImport(...)`;
7. `dry_run` → вернуть отчёт (ничего не записано, AC-2);
8. применение построчно: `created` → `Repository.Create`, `updated` →
   `Repository.Update` с дописанными участиями; `skipped`/`rejected` —
   ничего. Построчная запись, а не одна транзакция на файл: спека выбрала
   «валидные пишем, отклонённые возвращаем» (FR-9), и частичный результат
   здесь — решение, а не дефект. `fighter_id` созданных бойцов
   проставляется в отчёт.

Новые доменные ошибки (`domain/domain.go`): `ErrUnsupportedFile`,
`ErrEmptyFile`, `ErrTooManyRows`, `ErrMissingNameColumn`, `ErrMalformedFile`.

### `repo/`

Изменений в запросах не требуется. Единственная добавка —
**миграция `migrations/00003_import.sql`** с индексом под сопоставление:

```sql
-- Импорт ростера из файла (спека 0049) читает весь ростер турнира и строит
-- индекс по ключу «имя + клуб» в памяти. Индекс ниже — не для самого
-- импорта (он и так берёт всех бойцов турнира одним запросом), а для
-- будущего точечного поиска дубля и для CountRoster-подобных проверок.
CREATE INDEX idx_fighters_name_club
    ON fighter.fighters (tournament_id, lower(btrim(name)), lower(btrim(club)));
```

> Если на этапе реализации выяснится, что точечного поиска по этому ключу в
> коде не появляется, миграцию не добавлять: индекс без читателя — мусор.
> Решение принимается на задаче T7, не заранее.

### `api/` — `modules/fighter/api/import_handler.go`

- `ImportFighters` — маппинг proto↔domain, отчёт → `ImportRowReport`.
- Ошибки → `connect.Code`: `ErrUnsupportedFile`/`ErrEmptyFile`/
  `ErrMissingNameColumn`/`ErrMalformedFile`/`ErrTooManyRows`/
  `ErrNominationNotFound` → `CodeInvalidArgument`; прочее → `CodeInternal`.
- Жёсткий предел размера тела: `len(content) > maxImportBytes` (2 МиБ) →
  `CodeInvalidArgument` — сервер не полагается на гейт в BFF.

### Регистрация

`module.go` и `internal/platform` меняются в одной точке: адаптер
`FighterNominationProvider` (`internal/platform/fighter_provider.go`)
получает метод `NominationsByTournament` поверх
`nomservice.List`. Новых зависимостей между модулями не
появляется — `fighter → nomination` уже есть.

- Межмодульные зависимости: `fighter → nomination` (расширяется),
  `fighter → tournament` (существует, активный турнир). Модули `stage`,
  `pool`, `bout` не затрагиваются: импорт создаёт бойцов теми же
  репозиторными операциями, что и `CreateFighter`, а реконсиляция ростера
  (0009/0018) работает от состояния, не от события.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

- BFF: `app/api/fighters/import/route.ts` — `POST`, `multipart/form-data`:
  поле `file`, поле `dryRun` (`"true"`/`"false"`), поле `nominationIds`
  (повторяемое). Гейт по образцу `app/api/tournament/files/[kind]/route.ts`:
  расширение/`Content-Type` (`text/csv`, `application/vnd.openxmlformats-
  officedocument.spreadsheetml.sheet`, плюс `.csv`/`.xlsx` по имени — Excel
  и браузеры врут про MIME), размер ≤ 2 МиБ. Дальше — `fighterAdminClient.
  importFighters` с `Authorization: Bearer`. Ответ — JSON-DTO отчёта
  (`to-import-report-dto.ts` рядом с `to-fighter-dto.ts`).
- Слои:
  - `entities/fighter/` — типы отчёта (`ImportRowReport`, `ImportSummary`,
    исходы и причины как строковые литералы) рядом с существующим типом
    бойца.
  - `features/fighter-management/api/` — `requests.ts`: `importFighters
    (file, { dryRun, nominationIds })` (собирает `FormData`);
    `use-import-fighters.ts` — мутация TanStack Query; успешный
    **неdry-run** инвалидирует ключи ростера (`keys.ts`), предпросмотр —
    нет.
  - `features/fighter-management/ui/import-fighters-dialog.tsx` — диалог
    в трёх состояниях одного компонента: **выбор** (файл + чекбоксы
    номинаций-умолчаний + ссылка на образец), **предпросмотр** (сводка
    FR-4 + таблица строк с исходом и причиной + кнопка «Импортировать»),
    **отчёт** (та же таблица после записи + кнопка «Готово»).
  - `features/fighter-management/ui/import-report-table.tsx` — общая
    таблица для предпросмотра и отчёта: строка, имя, клуб, номинации,
    исход, причина.
  - `fighters-screen.tsx` — кнопка «Импорт из файла» в том же ряду, где
    «Создать бойца» / «Свести дубли».
- Образец файла: статический `web/public/fighters-import-template.csv`
  (заголовок `имя;клуб;номинации` + две строки-примера), ссылка в диалоге
  (FR-11). Генерация образца под номинации конкретного турнира — не в этой
  фиче.
- Server components vs client: диалог и таблица — клиентские (файл,
  состояние шага); страница ростера остаётся как есть.
- State: отчёт предпросмотра — локальный `useState` диалога (он живёт ровно
  столько, сколько открыт диалог, в кэш RQ не кладётся); ростер — RQ.

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей). Если фиче нужны доменные события — отметить здесь, что
> потребуется, и не реализовывать до принятия EDD-ADR.

- Издаёт: нет.
- Потребляет: нет.
- Заметка: импорт — массовый аналог `CreateFighter`, и как `CreateFighter`
  он не уведомляет `stage`/`pool` (те читают ростер лениво, 0009). EDD
  здесь не нужен.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- Юнит `pkg/tabular` — таблица фикстур: CSV UTF-8, CSV UTF-8 c BOM, CSV
  windows-1251, CSV с `,` и с `;`, XLSX (маленькая книга, собранная
  `excelize` в самом тесте — бинарники в репо не кладём), пустой файл,
  неизвестное расширение, превышение `MaxRows`.
- Юнит `domain.PlanImport` — основная масса тестов, по одному кейсу на
  каждый AC спеки: AC-1, AC-3..AC-8, AC-11..AC-14. Без БД и без файлов.
- Юнит `domain.NormalizeKey` — регистр, окружающие и внутренние пробелы.
- Юнит `service` на fake-репо (`testutil/fake_repo.go`,
  `fake_nomination_provider.go` — последний дополняется новым методом):
  `dry_run` ничего не пишет (AC-2), не-`dry_run` пишет валидные и
  возвращает отклонённые (FR-9), чужой `default_nomination_id` → ошибка,
  ошибки уровня файла.
- E2E ручки `api/import_handler_test.go` (httptest + Connect, fake-репо):
  счастливый путь, `dry_run`, превышение размера, маппинг доменных ошибок
  в `connect.Code`, отказ не-admin (AC-9).
- Интеграционные с БД (`modules/fighter/integration/`): один сценарий
  «импорт → повторный импорт того же файла» на реальном Postgres —
  проверяет, что дедуп FR-8 действительно не задваивает ростер (AC-8), а
  не только план в памяти.
- Web (Vitest): BFF-роут (гейты типа/размера, `FormData` → gRPC, маппинг
  `connect.Code` → HTTP), `requests.ts` (сборка `FormData`),
  `import-fighters-dialog.tsx` (переходы шагов, кнопка «Импортировать»
  зовёт мутацию с `dryRun: false`), `import-report-table.tsx` (исходы и
  причины отрисованы).

## Риски и открытые вопросы

- **Новая Go-зависимость `excelize`** — заметная (тянет свои зависимости на
  zip/xml). Если на T2 окажется, что вес неприемлем, отступной путь:
  принимать только CSV, а XLSX-строку в спеке понизить до «конвертируйте в
  CSV». Решение принимается на T2 с `go mod why`/размером бинаря, не
  заранее.
- **Двойной разбор файла** (предпросмотр + подтверждение) означает, что
  между шагами ростер мог измениться и итог отличается от предпросмотра.
  Это осознанно: отчёт после записи показывает фактический результат, а
  цена альтернативы — хранимое состояние сессии импорта.
- **Гейт размера в двух местах** (BFF и api-слой) — дублирование, но
  намеренное: сервер не доверяет клиенту. Константы разные по смыслу,
  синхронизировать их не нужно, достаточно чтобы серверная была не меньше.
- **Определение кодировки эвристикой** (UTF-8 или windows-1251) может
  ошибиться на коротком файле из одних латинских имён — но там обе
  кодировки дают один результат, так что практического риска нет.
- **Заголовок обязателен.** Файл без строки заголовка отклоняется целиком.
  Альтернатива «угадывать колонки по содержимому» отвергнута как источник
  тихих ошибок.

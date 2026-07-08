# ADR 0010: Интеграционные e2e-тесты с БД и сквозной сериализацией

- Статус: принято
- Дата: 2026-07-08

## Контекст

ADR 0003 зафиксировал пирамиду: юнит (fake-репо) + e2e ручек (httptest +
Connect-клиент, без БД) + Vitest на чистую логику. Интеграционные тесты с БД
тогда отнесли «по необходимости — добавляются позже».

Эта необходимость наступила на спеке 0001. Три регрессии прошли мгновенно мимо
unit/handler/Vitest, потому что они живут **на границах**, которые старая
пирамида не покрывала:

1. **Миграции турнира не применялись в Docker-стеке.** `server/Dockerfile`
   копировал только `auth/migrations`; `docker-compose.yml` гонял goose с
   общей `goose_db_version` → одинаково названная `00001_init.sql` второго
   модуля silent-skip'алась. Юнит/handler-тесты с fake-репо этого видеть не
   могут: для них миграций не существует.
2. **proto3-omitted дефолты ломают UI.** `toJson` опускает пустые строки и
   пустой `repeated`; BFF отдавал `{id, isActive, ...}` без `contacts`; UI
   звал `tournament.contacts.filter(...)` → краш страницы. Юнит-тест serialize
   покрывал только happy-path с заполненным турниром; handler-тест мокал
   serialize и не доходил до реального `toJson`.
3. **Enum-строка → NaN в binary proto.** UI хранит `ContactType` строкой
   (`"CONTACT_TYPE_TELEGRAM"`), а proto-поле — `int32`. BFF передавал строку
   как есть → `Number("CONTACT_TYPE_TELEGRAM")` → `NaN` → `serialize binary:
   invalid int32`. Handler-тест с fake-сервером этого не ловил: сериализация
   идёт на стороне connect-es, а реальный gRPC в тестах не поднимался.

Общая закономерность: тесты мокали границу (BFF↔gRPC, SQL↔repo) и проверяли
happy-path с заполненными данными. Реальный транспорт, реальная миграция и
реальная бинарная сериализация протоколов — нет. Нужен слой, который проверяет
их целиком, а не заглушками.

## Решение

Добавить слой **интеграционных e2e-тестов**, отдельный от `go test ./...` и
`pnpm test`, требующий Docker (Postgres). Дополняет, не заменяет ADR 0003.

### Server (Go)

1. **Postgres через `testcontainers-go`** в Docker-демоне тест-машины. Один
   контейнер на тест-пакет (`t.Helper` + `t.Cleanup` terminator). Образ
   `postgres:16-alpine` — тот же, что в `docker-compose.yml`.
2. **Миграции гоняются goose Go-API** с `-table goose_db_version_<module>` на
   модуль — повторяет логику `Makefile`/`docker-compose.yml` и структурно
   ловит класс silent-skip'а (две одинаково названные `00001_init.sql`).
   Источник миграций — `modules/*/migrations/*.sql`.
3. **Build-тег `integration`** на `*_integration_test.go`. `go test ./...`
   без тега такие файлы **не видит** → локальная разработка остаётся
   Docker-free (ADR 0003 сохраняется). Запуск — `make test-integration`
   (`go test -tags=integration ./...`).
4. **Реальный транспорт Connect в интеграционных тестах.** Поднимаем HTTP-сервер
   через `httptest.NewServer` на реальном composition-root (`internal/platform`
   сборка mux), бьём по нему сгенерированным Connect-клиентом на
   `http.DefaultClient`. Полный путь: proto-запрос → binary-serialise →
   интерсепторы → handler → service → `repo` (pgxpool на testcontainers
   Postgres) → SQL → back → binary-deserialise → proto-ответ. Покрывает
   proto3-omitted, NaN-enum, event-range validation и любой будущий класс
   багов на транспортной/сериализационной границе.
5. **Локация файлов**: `server/modules/<name>/integration/*_integration_test.go`.
   Build-tag `//go:build integration` в первой строке. Пакет `integration` (или
   `module_test` рядом, если удобнее с приватными полями — по факту публичного
   API `service.New(repo)` + `internal/platform` достаточно).
6. **DB-helper** — `server/internal/testdb` (публичный пакет; всё, что Outside
   composition root — ближе к `internal/`, поэтому `internal/testdb`):
   `Postgres(t)` возвращает `*pgxpool.Pool` + connection string, применяет все
   миграции модулей через goose. Один helper на тест, `t.Cleanup` закрывает.
7. **Что обязательно проверяют integration-тесты модуля**:
   - миграции накатываются без ошибок (схема/таблицы/индексы/CHECK/сид);
   - репозиторий (sqlc) корректно round-trip'ит через реальный PG
     (`GetActive` возвращает сид, `UpdateActive` меняет строки);
   - полный Connect-путь RPC: публичный — без токена; admin — `RequireAdmin`
     применён, доменные ошибки маппятся в `connect.Code`;
   - proto3-граница: пустые дефолты (seed), неверный enum, опциональные
     timestamp'ы — все ветки реального бинарного marshal/unmarshal.

### Web (TS, Vitest)

1. **Не мокать `tournamentToJson`** (и аналоги) в route-тестах, которые
   претендуют на e2e. Сейчас `route.test.ts` мокает serialize и потому не ловил
   proto3-omitted. Новый слой — Vitest-тест с **реальным** `toJson` и
   **mock-транспортом** connect-es (`createConnectTransport` с инжектируемым
   `fetch` через `vi.stubGlobal` или in-memory `Transport`).
2. **Проверки**:
   - `toJson` от реального proto-ответа (через `fromJson` в мок-транспорте)
     нормализует дефолты → BFF-response стабилен (пустой `contacts: []`, не
     `undefined`);
   - enum string→число маппируется в BFF (NaN-enum регрессия);
   - опциональные `eventStartAt`/`eventEndAt` round-trip в обе стороны;
   - `PUT` с partial body (без end) → в протобуф уходит только start.
3. **Локация**: `web/src/app/api/tournament/route.e2e.test.ts` — рядом с route,
   суффикс `.e2e.test.ts` отличает от unit-тестов логики ручки. Запуск —
   `pnpm test` (Vitest по умолчанию) или отдельный скрипт `pnpm test:e2e`, если
   станет тяжело. Сейчас вся web-e2e — это дешёвые тесты (без Docker); отдельный
   тег не нужен.

### CI

`.github/workflows/ci.yml` (раньше был заявлен в root AGENTS.md, но файла не
было) — path-filtered. Jobs:

- **proto** — `buf lint` (только при правках `proto/`).
- **server** — `go vet` + `go test ./...` (без тега) + `go test -tags=integration
  ./...` (с `docker`-сервисом `services: postgres` НЕ подходит — testcontainers
  поднимает сам; GitHub Actions runner имеет Docker предустановленным).
- **web** — `pnpm lint` + `pnpm exec tsc --noEmit` + `pnpm test` (включает
  `.e2e.test.ts`).

CI ловит класс регрессий, который мы ловили руками. testcontainers в GitHub
Actions работает нативно.

### Что НЕ покрывает этот ADR

- **Сквозной браузерный путь** (рендер hero → fetch → BFF → gRPC → PG) — это
  Playwright-уровень, сознательно не вводим (ADR 0003 отказался от скриншотных
  тестов; UI-логику покрываем точечными Vitest на компоненты/функции).
- **Прогон всего `docker-compose` из теста** — избыточно и медленно. Хелпер
  `testdb` точечно поднимает только PG; Go-сервер — `httptest` in-process.
- **Mutation-тесты / property-based** — вне скоупа.

## Обоснование

- testcontainers поднимает ровно то, что нужно (Postgres), и убирает после
  себя; локально и в CI один и тот же путь, без «поднял compose вручную».
- Build-tag `integration` сохраняет ADR 0003: `go test ./...` без Docker,
  локальный цикл быстрый, интеграционные — отдельной командой.
- goose Go-API с per-module table версий повторяет `Makefile`/`compose` и
  структурно ловит silent-skip одинаково названных миграций.
- Реальный `httptest` server + Connect-клиент тестирует именно то, что ломалось
  (proto3-binary, enum NaN, замена server-стороне), без mock'ания
  синхронизации.
- Vitest с реальным `toJson` покрывает BFF-сериализацию, а mock-транспорт
  даёт контролируемый proto-ответ в тест-pipeline.
- Единый ADR фиксирует все три класса багов (миграции, serialize, enum),
  которые прошли мимо старой пирамиды; композиция этих приёмов — стандартная
  defence-in-depth для AI-first разработки (правки делаются часто, границ много).

## Последствия

- `server/internal/testdb` — публичный хелпер. И `modules/*/integration/` под
  build-tagом `integration` — обязательны для каждого модуля, который владеет
  PG-схемой.
- `make test-integration` (server) и `pnpm test` (web, `.e2e.test.ts` включены)
  прогоняются локально при правках миграций/контрактов/serialize;
  обязательно в CI.
- ADR 0003 остаётся в силе для unit/handler-тестов; интеграционный слой —
  надстройкой, не заменой. В ADR 0003 и `docs/conventions.md` правим раздел
  «интеграционные с БД» — ссылка сюда.
- Каждый новый модуль: добавляет `migrations/00001_init.sql` → обязан завести
  `integration/<module>_test.go` (минимум: миграции применяются, seed читается,
  хотя бы один публичный RPC через реальный Connect).
- `server/go.mod` — добавляется `testcontainers-go` (уже через `go get`).
- Для web: Vitest-конфиг (`vitest.config.ts`) по умолчанию включает
  `*.e2e.test.ts`; если понадобится разделить на быстрый/полный набор —
  отдельный `pnpm test:e2e` скрипт. Сейчас `.e2e.test.ts` !== `.test.ts` только
  для читабельности, не для отдельного набора.
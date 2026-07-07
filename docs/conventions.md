# Соглашения

## Именование

- **Go**: пакеты — короткие, lower-case, без подчёркиваний. Экспортируемые
  идентификаторы — `CamelCase`. Ошибки — `ErrXxx` или обёртки через `fmt.Errorf`.
- **proto**: пакеты `hema.v1`; сервисы `XxxService`; RPC — глаголы
  (`Login`, `Register`); сообщения — `XxxRequest`/`XxxResponse`.
- **TS**: файлы — `kebab-case`; компоненты — `PascalCase`; хуки — `useXxx`.
- **SQL/sqlc**: имена запросов — `CamelCase` в аннотации `-- name: GetUserByEmail :one`.

## UI (web) — см. ADR 0005

- **FSD-aligned App Router**: `app/` — роуты, поверх — слои
  `shared → entities → features → widgets`. Слой импортит только
  нижележащие (`app → widgets → features → entities → shared`). `features`
  не импортят друг друга. `lib/` (BFF-инфраструктура) — отдельный слой для
  серверных модулей.
- **shadcn/ui** в `src/shared/ui/` — это наш код (НЕ gen), коммитится и
  правится. `components.json`: `ui → @/shared/ui`, `utils → @/shared/lib/cn`.
- **Тема**: dark + light через `next-themes` (`attribute="class"`). Цвета —
  CSS-переменные в `src/app/globals.css`. Не хардкодить цвета в компонентах —
  использовать токены (`bg-background`, `text-foreground`, ...).
- **Server component по умолчанию**; `"use client"` — только для
  хуков/роутера/браузерных API. Auth-состояние в server components — через
  `entities/user/model/get-current-user.ts` (cookie + gRPC `me`).
- **shadcn-компоненты трогать можно** (в отличие от `gen/`/`sqlc/`). Правим
  под проект прямо в `src/shared/ui/`.

## State management (web) — см. ADR 0006

Три слоя состояния, каждый — свой инструмент:

| Слой | Инструмент | Где живёт |
|------|------------|-----------|
| Server state в client-компонентах | **TanStack Query v5** | `features/<f>/api/` (хуки, keys, requests), `entities/<e>/api/` |
| Cross-component UI state (client-only) | **Zustand v5** | `features/<f>/model/<name>-store.ts` |
| Local component state | `useState` / `useReducer` | в самом компоненте |

- **Server Components — дефолт для данных** (SSR + gRPC напрямую через
  `lib/grpc`). Не дублируем server-side получение в RQ без реальной потребности.
- **RQ-инфра**: `shared/lib/query-client.ts` (`makeQueryClient()` factory),
  `shared/lib/query-provider.tsx` (`QueryClientProvider` + devtools в dev-only).
  `QueryClient` — per-request на сервере, singleton в браузере.
  `staleTime: 60_000` дефолт.
- **Query keys**: иерархические `['feature', 'scope', ...params]`, в
  `features/<f>/api/keys.ts`. Инвалидация — `invalidateQueries({ queryKey })`.
- **Мутации**: `useMutation` зовёт fetcher из `api/requests.ts` (не `fetch`
  напрямую). `onSuccess` — side-effects (router, invalidate, close dialog).
- **Zustand**: только client UI state. **Не класть server data в store**
  (утечка между запросами на сервере). Без провайдеров — `create()` →
  `useXxxStore((s) => s.field)`. Browser API — только внутри экшенов.
- **`useState` не заменяется**. Локальный стейт — всегда `useState`. Не тянем
  RQ/zustand туда, где достаточно локального состояния.
- **Prefetch + `HydrationBoundary`** — когда нужен SSR-initial + client-refetch:
  Server Component `prefetchQuery` → `<HydrationBoundary state={dehydrate()}>`.

## Слои модуля (server)

```
api/      транспорт: реализация Connect-сервиса, маппинг proto ↔ domain
service/  бизнес-логика (юзкейсы), не знает про proto и про SQL напрямую
domain/   сущности, интерфейсы (порты), доменные ошибки
repo/     адаптеры к БД: sqlc-сген + реализация репозитория
```

Зависимости направлены внутрь: `api → service → domain`, `repo` реализует
интерфейсы `domain`. `service` зависит от портов, не от конкретного `repo`.

## Ошибки

- Домен возвращает типизированные ошибки (`domain.ErrUserExists` и т.п.).
- Слой `api` мапит доменные ошибки в `connect.Code` (`CodeAlreadyExists`,
  `CodeUnauthenticated`, `CodeInvalidArgument`, ...).
- BFF мапит `connect.Code` в HTTP-статусы.

## Конфигурация

- Только через переменные окружения (12-factor). Схема — в `pkg/config`.
- Никаких секретов в коде/гите. Локальные значения — в `.env` (в `.gitignore`),
  публичный шаблон — в `.env.example`.

## Генерация кода

- `**/gen/`, `**/sqlc/` — сгенерировано, помечено `DO NOT EDIT`. Не править руками.
- Меняем источник (`.proto`, `.sql`) → перегенерация (`make generate` / `make sqlc`).

## Тестирование

### Обязательное правило

**Каждый инкремент (новый RPC, юзкейс, модуль, маршрут BFF) должен содержать
тесты.** PR без тестов — не принимается. Тесты коммитятся в том же инкременте,
что и код.

### TDD-цикл на практике — см. ADR 0009

Порядок работы — **red → green → refactor**: сначала падающий тест (описывает
поведение), затем минимальный код, затем рефактор при зелёных тестах. Тесты не
переписываются под уже написанный код. Для нетривиальной фичи шаги берутся из
`tasks.md` спеки (`docs/specs/NNN-*/`, см. ADR 0008). Уровень теста по типу
изменения — в `docs/adr/0009-tdd-workflow.md`.

### Пирамида тестов (server, Go)

1. **Юнит-тесты** — чистая логика без внешних зависимостей.
   - `pkg/*` — тесты утилит (crypto, jwt, config).
   - `modules/*/service/` — тесты юзкейсов с **fake-репозиторием** (in-memory
     реализация `domain.Repository`), без реальной БД.
   - Запуск: `go test ./...`.

2. **Интеграционные тесты хендлеров (e2e ручек)** — полный путь через Connect:
   proto-запрос → хендлер → service → маппинг ошибок → proto-ответ.
   - `modules/*/api/` — через `httptest` + сгенерированный Connect-клиент.
   - Используют fake-репозиторий, не требуют реальной БД.
   - Проверяют: корректность ответа, маппинг доменных ошибок в `connect.Code`.

3. **Интеграционные с БД** (по необходимости) — реальный PostgreSQL через
   testcontainers или отдельную тестовую БД. Для миграций и sqlc-запросов.

### Test doubles

- Fake-репозитории живут в `modules/*/testutil/` — in-memory реализации
  `domain.Repository` (и других портов). Используются и service-тестами, и
  handler-тестами.
- Имя: `Fake<Name>` (например, `FakeRepo`). Не `Mock` — это не генерируемые
  моки, а ручные fakes с простым состоянием.

### Именование тестов

- Файлы: `*_test.go` (Go), `*.test.ts` (TS).
- Go: `TestXxx` — таблиц-driven где уместно; `t.Run` для подвтестов.
- Имена подвтестов — человекочитаемые сценарии: `"duplicate email returns ErrUserExists"`.

### Что тестировать обязательно

- Счастливый путь каждого RPC/юзкейса.
- Все доменные ошибки (дубликат, не найдено, невалидные данные).
- Граничные случаи: пустой email, короткий пароль, истёкший/невалидный токен.

### Клиент (web, Vitest)

- Юнит-тесты чистой логики: маппинг `connect.Code` → HTTP, сериализация.
- UI-тесты — по мере появления реальных компонентов (скриншотные тесты
  намеренно не используем).
- **Protobuf-моки**: generated-типы (`User`, `MeResponse`, `Timestamp`, ...) имеют
  brand `$typeName` от `Message<"...">`. Plain-объекты не присваиваются — `tsc`
  в CI ловит `TS2322`/`TS2345`, даже если Vitest (transpile-only) проходит.
  Используй `create(Schema, partial)` из `@bufbuild/protobuf` со сгенерированными
  схемами (`UserSchema`, `MeResponseSchema`, `TimestampSchema` из
  `@bufbuild/protobuf/wkt`). Локально всегда проверяй `pnpm exec tsc --noEmit`
  после изменения тестов с protobuf-моками — `pnpm test`alone не ловит.

### Запуск

| Команда           | Действие                              |
| ----------------- | ------------------------------------- |
| `make test`       | Сервер: `go test ./...`               |
| `make test-web`   | Клиент: `pnpm test`                   |
| `make test-all`   | Все тесты (server + web)              |

## Коммиты

- Сообщения — на английском, в стиле Conventional Commits:
  `feat(auth): add login endpoint`, `chore(proto): regenerate`.
- Тесты идут в том же коммите, что и код (или в связанной серии коммитов).

# Plan: <название фичи>

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: draft | ready | done
- Дата: YYYY-MM-DD
- Спека: `./spec.md`

## Обзор решения

<2–4 предложения: как в целом устроена реализация. Синхронно/событийно,
новый модуль или расширение существующего.>

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

- Файл(ы): `proto/hema/v1/<...>.proto`
- Новые/изменённые сервисы: `XxxService`
- RPC: `Verb(XxxRequest) → XxxResponse`
- Сообщения: `Xxx`, поля ...
- Enum/общие типы (`common.proto`): ...

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

- Модуль: `modules/<name>/` — <новый bounded context | расширение>
- PG-схема: `<name>` (при новом модуле — своя схема, миграция создаёт её)
- Слои:
  - `domain/` — сущности, порты (интерфейсы), доменные ошибки: ...
  - `service/` — юзкейсы: ...
  - `repo/` — sqlc-запросы (`repo/queries/*.sql`) + реализация порта: ...
  - `api/` — Connect-хендлер, маппинг proto↔domain, ошибки→`connect.Code`: ...
  - `migrations/` — goose: ...
- Регистрация: `Register(...)` + wiring в `internal/platform`
- Межмодульные зависимости: <нет | через API модуля X>

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

- BFF (Route Handlers, Node runtime): `app/api/<...>/route.ts` — REST→gRPC
- Слои:
  - `entities/<e>/` — модель/типы: ...
  - `features/<f>/` — `api/` (requests, keys, RQ-хуки), `model/` (zustand),
    `ui/`: ...
  - `widgets/` — композиции: ...
- Server components vs client: <что где>
- State: server-state → TanStack Query; UI-state → Zustand; local → useState

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей). Если фиче нужны доменные события — отметить здесь, что
> потребуется, и не реализовывать до принятия EDD-ADR.

- Издаёт: <нет | событие X>
- Потребляет: <нет | событие Y>

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- Юнит (`pkg/`, `service/` с fake-репо): ...
- E2E ручек (`api/` через httptest + Connect): ...
- Интеграционные с БД (если нужны): ...
- Web (Vitest): ...

## Риски и открытые вопросы

<Технические риски, точки, где план может измениться при реализации.>

- ...

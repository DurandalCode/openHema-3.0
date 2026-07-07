# Plan: Health-check

> Пример-скелет (ADR 0008). Демонстрирует, как `spec.md` ложится на архитектуру.

- Статус: ready
- Дата: 2026-07-07
- Спека: `./spec.md`

## Обзор решения

Синхронный публичный RPC `Check`, отдающий статус `SERVING`. Живёт в `pkg`-слое
как переиспользуемый health-хендлер (не доменный модуль — у него нет bounded
context и своей PG-схемы). Регистрируется в `internal/platform` рядом с
модулями, эндпоинт исключается из auth-интерсептора.

## Контракты (proto)

- Файл: `proto/hema/v1/health.proto`
- Сервис: `HealthService`
- RPC: `Check(CheckRequest) → CheckResponse`
- Сообщения: `CheckRequest` (пусто); `CheckResponse { ServingStatus status }`
- Enum: `ServingStatus { SERVING_STATUS_UNSPECIFIED, SERVING, NOT_SERVING }`

## Server (модули и слои)

> Health — инфраструктурный, не доменный. Не заводим модуль/схему.

- Расположение: `pkg/health/` — хендлер `HealthService` + конструктор.
- PG-схема: нет (liveness не трогает БД).
- Слои: только транспортный хендлер (доменной логики нет) — оправданное
  отступление от полной раскладки модуля, зафиксировать в PR-описании.
- Регистрация: `Register(mux)` в `pkg/health`, вызов в `internal/platform`.
- Auth: путь `HealthService/Check` добавить в whitelist auth-интерсептора
  (`pkg/connectutil`), чтобы не требовать Bearer.

## Web (FSD + BFF)

- BFF: `app/api/health/route.ts` (Node runtime) — проксирует gRPC `Check`,
  мапит `SERVING`→200, иначе→503.
- UI: не требуется (эндпоинт для инфраструктуры). Опционально позже — индикатор
  в footer.
- State: не применимо.

## События

- Издаёт: нет.
- Потребляет: нет.

## Тестирование

> ADR 0003 + ADR 0009.

- Юнит: `pkg/health/*_test.go` — хендлер возвращает `SERVING`.
- E2E ручки: `pkg/health/*_test.go` через httptest + Connect-клиент —
  вызов без `Authorization` не даёт `Unauthenticated` (проверка whitelist).
- Web: `app/api/health/route.test.ts` — маппинг статуса в HTTP-код (mock gRPC).

## Риски и открытые вопросы

- Whitelist в auth-интерсепторе: нужно решить механику исключения путей
  (список procedure-строк vs отдельный набор публичных сервисов). Мелкое
  техрешение — фиксируем в коде, отдельный ADR не нужен.

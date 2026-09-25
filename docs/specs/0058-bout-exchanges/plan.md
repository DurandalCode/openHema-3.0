# Plan: Журнал сходов

- Статус: draft; условный на D-EXCH. База 0052+0056, после 0057 из-за общих stage writers.
- Спека: [spec.md](spec.md).

## Модель и архитектура

Расширение уже event-sourced `bout`, не новая шина. События `exchange_recorded`, `exchange_corrected`, `exchange_voided`; стабильный exchange_id, paired delta_a/b, nullable remaining_cs, note, correction reason и исходная ссылка. Каждая correction несёт полное новое значение записи, void явную отмену. Replay детерминированно складывает действующие записи с baseline, проверяет промежуточную неотрицательность и предел текущего score-типа до преобразования. `actor_id/occurred_at` берутся сервером из существующего event envelope, не из клиента.

Первый exchange после legacy score фиксирует baseline в событии; legacy `scored` остаются историей абсолютных коррекций. После первого exchange прямой Score RPC переводится в explicit adjustment event (delta от авторитетного счёта) с отдельным отображаемым типом; не добавлять второй независимый счёт. Reset открывает новую сессию журнала с нулевым baseline; предыдущие события сохраняются как завершённая сессия, Reopen продолжает текущую. Событие correction/void не может ссылаться на другую сессию/bout. Технический исход 0056 сохраняет журнал, но не вычисляется из его итогового счёта.

Обязательный ADR: расширение ADR0013 для сохраняемых **снимков** времени, без event sourcing каждого тика. Снимок клиента — NULL либо целое число сотых в диапазоне 0…2147483647; не сравнивать с нынешней default duration: существующее добавление времени может законно её превысить, а default впоследствии измениться. Проверить границы и переполнение; снимок не называется авторитетным измерением. Смена сторон на табло не меняет fighterA/B в событиях.

## Контракты

Расширить `ApplyBoutCommand` в `proto/hema/v2/arena_control.proto` (0052): additive oneof actions record/correct/void exchange. Mutation несёт `ArenaSelectionContext` и `BoutCommandContext`0052 (arena/pool/bout/selection revision + command_id/expected_version), exchange_id и paired values; correction reason required. Новый read RPC `GetBoutExchanges` в admin service `stage.proto` несёт bout_id, возвращает baseline, session, ordered revisions/current entries и итоговый version. Данные истории не включать в каждый live tick/snapshot; live сообщает version, открытый журнал перечитывается при изменении. BFF server-only routes; auth повторно в Go handler. Перегенерация proto обязательна.

## DDL и persistence

Новых таблиц нет: source of truth — `bout.bout_events`, projection score/version — `bout.bouts`. Следующая миграция расширяет существующий event_type CHECK четырьмя именами: `exchange_recorded`, `exchange_corrected`, `exchange_voided`, `score_adjusted`; оставляет типы 0056. Payload JSON schema проверяется доменом до Append; DB CHECK остаётся object. Command identity/expected_version — механизм 0052. Уникальность exchange_id внутри bout проверяется при replay под optimistic version; конкурирующие append с той же версией дают conflict, retry не дублируется.

Индекса `(bout_id,version)` достаточно для ordered Load. Projection append атомарен с событием. Нет массовой миграции legacy истории и выдуманных exchange rows. Down не допускается при новых event types; не стирать историю ради rollback. Интеграционный тест replay из реальной БД сверяет score projection и историю после correction/void/reset/reopen.

## Слои и UI

`bout/domain`, `service`, repo mapping; stage command guard и `internal/platform/stage_bout_conductor.go`; handlers и сериализация. Web: новая `features/bout-exchanges` с парным вводом/историей/коррекцией; `widgets/arena-console` композиция и очередь 0052. Значения вводятся в логических сторонах, display swap — только представление. Локальный черновик в UI state с привязкой bout/version; очередь мутаций одна для score/exchanges/finish. Finish ждёт подтверждения; при conflict не откатывать чужое успешное действие optimistic cache.

Длинный журнал допускает виртуализацию/постраничное чтение позже, если измерения покажут проблему; v1 читает историю одного боя, не всей номинации. Не устанавливать молча лимит судейских решений.

## Проверки

Replay с legacy, сменой сессии, technical finish, отрицательными дельтами и нулевой парой; correction/void ранних записей; overflow; idempotency; concurrent score/exchange/finish; неверная ссылка. API/BFF auth и stale context. Web paired form, keyboard, side swap, offline draft, конфликт при новом бое. Ручная сверка журнала/итога с групповой таблицей и CSV0059 (CSV остаётся по боям, не по сходам).

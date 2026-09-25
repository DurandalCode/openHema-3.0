# Plan: Технические исходы боя

- Статус: draft; условный план для согласования D-TECH.
- Спека: [spec.md](spec.md). Зависимости: 0052, затем 0054 и базовый 0059 до изменения общих контрактов.

## Архитектура

Расширить event-sourced `bout` и оркестрацию `stage`. `bout` владеет исходом, `stage` — правилом обработки будущих пар и продвижением. Межмодульный доступ только через порты и адаптеры `internal/platform`; общей шины событий не вводить. Перед кодом оформить ADR о сохраняемом каскаде, возобновлении и версии модели результата.

Каскад использует внутренний bout context `(bout_id, expected_version, command_id/command_input)` из 0052, **без аренного selection guard**, SetCurrent и Reveal. Он адресует также непосаженные/нетекущие бои, не меняя объявленную пару. Если технически завершается текущий fallback-бой до Start, stage сначала закрепляет его как current в согласованной критической секции 0052, чтобы пересчёт fallback не потерял оглашение. Для ручной команды из панели selection guard0052 остаётся обязательным: добавить technical-finish action в `hema.v2.ArenaControlService.ApplyBoutCommand`. Массовые policy RPC в stage admin service отдельно не имитируют аренную команду.

Один завершённый бой — атомарный append события и обновление projection в bout. Каскад **не атомарен целиком**: durable work list, идемпотентный command на каждый бой, видимый прогресс и конфликты. При восстановлении сначала сверять уже применённый command, затем продолжать. Успех отдельного bout при неуспехе stage promotion должен повторно довести promotion, а не повторно завершить бой.

## Контракты

`proto/hema/v1/stage.proto`: additive RPC `PreviewTechnicalOutcome`, `ApplyTechnicalOutcome`, `GetTechnicalOutcomeOperation`, `DisableTechnicalOutcomePolicy`. Запрос preview: fighter/bout, scope, reason; ответ: targets с bout_id/expected_version, предупреждения и непрозрачный подписанный token состава. Apply: token, command_id, reason/пояснение; сервер повторно проверяет права, область и версии. Token не заменяет авторизацию.

`BoardBout` и DTO результатов: result_kind, winner_side, причина-код только в admin DTO; public/live получают только kind/winner, без причины и private note. В `bout.proto` добавлять тип результата только если нужен контракту, не дублировать отдельный lifecycle API. `BoardBout` общий для admin/public: reason/note не добавлять в общий converter. Создать отдельный admin result detail для причин и отдельный admin mapping; GetPublicBracket/GetNominationLive/GetTournamentLive обязаны оставаться без reason/note. Не переиспользовать значение draw для незавершённого или конфликтного боя. Новые поля совместимы; для фактического breaking change — следовать proto/AGENTS.md.

Изменить через порты `BoutRef`, standings, bracket propagation, public/live, export0059. Все читают authoritative outcome; вычислять победителя по score в web запрещено. В группах технический бой исключается только из points_for/against, не из played/wins/losses.

## Данные

Следующие свободные goose-номера выбрать **после мержа зависимостей**. Нельзя заранее занять номер миграции 0052.

В `bout.bouts` добавить:

| Колонка | Тип / ограничение |
| --- | --- |
| result_kind | TEXT NULL CHECK IN ('normal','technical') |
| winner_side | TEXT NULL CHECK IN ('a','b','draw') |
| technical_reason | TEXT NULL CHECK IN ('absence','injury','disqualification','other') |

CHECK: незавершённое состояние имеет NULL result fields; finished имеет kind/winner; technical требует a/b и reason; normal требует reason NULL. Backfill finished из score, незавершённые NULL. Свободное пояснение остаётся в admin-only event payload. Расширить фактический CHECK `bout.bout_events.event_type` типом `technical_finished`; имена ограничений проверить в БД. Reopened очищает result projection, старое событие остаётся. Использовать command_id/expected_version из 0052, не создавать второй idempotency-механизм.

Новые таблицы в **stage**, без FK в чужие схемы:

- `technical_policies`: id UUID PK; command_id UUID NOT NULL UNIQUE; tournament_id UUID NOT NULL; nomination_id UUID NULL; fighter_id UUID NOT NULL; scope TEXT CHECK IN ('nomination','tournament'); reason TEXT с CHECK как выше; note TEXT NOT NULL DEFAULT ''; active BOOLEAN NOT NULL DEFAULT true; actor_id UUID NOT NULL; created_at TIMESTAMPTZ NOT NULL DEFAULT now(); disabled_at TIMESTAMPTZ NULL. CHECK соответствия scope и nomination_id; CHECK active ↔ disabled_at IS NULL. Partial unique active `(fighter_id, nomination_id)` для nomination и `(fighter_id)` для tournament. Индексы активных по tournament/nomination. При пересечении областей сначала tournament; противоречащие причины запрещать сервисом под блокировкой fighter.
- `technical_operations`: id UUID PK; command_id UUID NOT NULL UNIQUE; request_hash TEXT NOT NULL; policy_id UUID NULL FK local policies; actor_id UUID NOT NULL; status TEXT NOT NULL CHECK IN ('pending','running','completed','conflicted'); created_at/updated_at TIMESTAMPTZ NOT NULL DEFAULT now(). Один вызов, в том числе single-bout, получает журнал и неизменяемый request hash.
- `technical_operation_items`: operation_id UUID NOT NULL FK local operations ON DELETE CASCADE; bout_id UUID NOT NULL; command_id UUID NOT NULL UNIQUE; expected_version INTEGER NOT NULL CHECK >=0; status TEXT NOT NULL CHECK IN ('pending','applied','conflict'); error_code TEXT NOT NULL DEFAULT ''; PRIMARY KEY(operation_id,bout_id). Индекс `(operation_id,status)` для продолжения.

Проверка future policies включается в каждый путь создания/материализации боя, включая bracket sync, до допуска Start. Даже если материализация/worker упал, Start повторно проверяет применимые правила и возвращает pending/conflict вместо обычного старта. Pending операции возобновляются при старте сервера и явном retry; многопроцессное выполнение защищено row locks/lease или `SKIP LOCKED` внутри короткой транзакции, не сетевым вызовом под бесконечной блокировкой. Для воркера lease нужен только если удерживать claim между транзакциями: выбранный ADR обязан определить это до T4; предпочтение — идемпотентные короткие операции без отдельного lease.

Down: не выбрасывать историю technical events. После появления таких данных откат миграции отклоняется; развернуть совместимый код или forward-fix. Up/backfill проверить на старых finished/draw/reset.

## Слои и web

- `bout/domain`: TechnicalFinish, Outcome, replay; service/repo append/projection; existing events сохраняются.
- `stage/domain`/`service`: preview/политики/каскад, authoritative standings и bracket, guards переоткрытия и старта; repo только свои таблицы.
- `server/internal/platform/stage_bout_conductor.go`: новый result mapping и команды через bout service.
- BFF `web/src/app/api/` — новые admin routes через server-only transport и существующую сериализацию; admin checks в серверном handler обязательны.
- `features/technical-outcome` — диалог победителя, причины, scope, preview и прогресса; `widgets/arena-console` подключает действие. `entities/bout`/существующие pool DTO и scoreboard renderer показывают technical badge без private note. После завершения invalidate/live обновление как 0052.
- CSV0059 получает kind/winner/reason-код из серверного результата; персональные пояснения не добавлять.

## Проверки и риски

TDD: replay старых/новых событий, technical winner при обратном счёте, нулевой/положительный счёт, double-withdraw, idempotency, stale version, сбой после bout append до stage ack, policy на будущей сетке, переоткрытие с descendants. DB integration проверяет CHECK/backfill/два worker. API e2e — auth/scope/retry; web — диалог и один результат на двух экранах; ручной учебный турнир с группами/основной/утешительной сетками.

Риск: поведение ranking и withdrawal затрагивает много потребителей. До запуска составить полный `rg`-список вычислений outcome и вызовов ScheduleBouts/Start; приёмка не ограничивается экраном арены. Не менять формулу обычных боёв, приоритет policy и спортправила без D-TECH.

# Tasks: Технические исходы

- Статус: draft, не начато. Каждый пункт: red → green → refactor.
- План: [plan.md](plan.md). Гейт: D-TECH утверждён; 0052/0054/0059 в базе.

- [ ] T0. Зафиксировать D-TECH, ADR каскада и конкретные имена новых полей/ограничений; обновить conditional spec/plan до ready. Собрать consumers outcome, ScheduleBouts, Start, Reopen.
- [ ] T0a. Начать изменение API с .proto по согласованному контракту → make generate → зафиксировать типы/поля и compatibility; только затем код слоёв. Handlers/BFF реализуются на своих шагах ниже.
- [ ] T1. `bout/domain`: сначала AC-1/2/7 и replay legacy; реализовать independent result, TechnicalFinish, Reopen, guard конфликтов. Не менять обычный score-based result.
- [ ] T2. `bout/migrations`, repo/sqlc: red integration на backfill, constraints, duplicate command и stale version; добавить projection и событие. Проверить migration up и отказ destructive down при новых данных.
- [ ] T3. `stage/domain/service` + platform adapter: red рейтинга/сеток/переоткрытия; распространить authoritative result, завершение/оглашение 0052 и retry promotion.
- [ ] T4. `stage` migrations/repo/service: red preview token, partial failure/restart/two workers, будущий этап, оба сняты; реализовать durable policies/operations, scopes, start guard, disable без undo истории.
- [ ] T5. Handlers/BFF по контракту T0a: сначала API auth/foreign tournament/changed preview/idempotency tests, затем RPC и mapping. Проверить реальные ответы GetPublicBracket/GetNominationLive/GetTournamentLive: нет ни reason, ни note. Admin CSV содержит только reason-code, без private note.
- [ ] T6. `features/technical-outcome`, arena/scoreboard: red диалога/частичного отчёта/удержания результата; реализовать интерфейс и ошибки.
- [ ] T7. Обновить consumers0053/0054/0059 тестами технического победителя при противоположном счёте. Не менять вручную gen/sqlc.
- [ ] T8. Выполнить применимые server/web тесты, build, lint/vet, DB integration; ручной сценарий AC-1…8. Передать координатору evidence и ограничения; только он обновляет общий индекс/пакет и решает merge.

# Tasks: Журнал сходов

- Статус: draft. D-EXCH и [plan.md](plan.md) должны быть утверждены перед кодом.
- [ ] T0. Зафиксировать решения, ADR о снимках времени и правила legacy/reset/correction; ready spec/plan.
- [ ] T0a. Начать изменение API с .proto по согласованному контракту → make generate → зафиксировать типы/поля и compatibility; только затем код слоёв. Handlers/BFF реализуются на своих шагах ниже.
- [ ] T1. Red domain replay для AC-1…5/7 и overflow, снимок времени после добавления секунд сверх default → события, baseline/session, correct/void/adjustment и детерминированный итог.
- [ ] T2. Red repo integration event CHECK/atomic append/version/replay → миграция и mapping без новых projection-источников.
- [ ] T3. Red service concurrent score/exchange/finish и stale selection → stage/bout commands, общая идемпотентность 0052.
- [ ] T4. По контракту T0a: red auth/foreign bout/payload errors → handlers, BFF и DTO истории.
- [ ] T5. Red paired input/correction/side swap/offline AC-6 → feature UI и единая очередь arena console. Проверить finish после последней записи.
- [ ] T6. Профильные тесты/build/lint/vet, DB integration, ручной протокол обычного/технического боя, Reopen/Reset и два клиента. Отчёт координатору, без самостоятельного merge.

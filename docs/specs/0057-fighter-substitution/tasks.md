# Tasks: Замена бойца

- Статус: draft. Гейт D-SUB; план [plan.md](plan.md).
- [ ] T0. Утвердить scope, ADR UoW/locking, список всех mutation writers и порядок locks; обновить spec/plan в ready. Если нужен active-scope, остановить этот трек до перепланирования.
- [ ] T0a. Начать изменение API с .proto по согласованному контракту → make generate → зафиксировать типы/поля и compatibility; только затем код слоёв. Handlers/BFF реализуются на своих шагах ниже.
- [ ] T1. Red для preview/eligibility/fingerprint и AC-1/2/6 → domain и stage/fighter порты.
- [ ] T2. Red integration transaction rollback и параллельной фиксации → явный UoW/wiring и общий lock protocol у перечисленных writers. Проверять deadlocks при нескольких номинациях.
- [ ] T3. Red constraints/duplicate command/changed payload → миграция audit, sqlc, атомарная service operation и лог.
- [ ] T4. По контракту T0a: red API auth/stale preview/foreign target/retry → Connect handler и BFF routes.
- [ ] T5. Red UI выбора/preview/ошибок → dialog/кнопки/mutations/invalidation, без изменения Merge.
- [ ] T6. Полный AC-1…6, профильные Go/web тесты, build/lint/vet, DB integration на двух соединениях. Передать report координатору; пакет/общий индекс самому не менять.

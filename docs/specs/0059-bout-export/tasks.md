# Tasks: Выгрузка отдельных боёв номинации

- Статус: draft
- Дата: 2026-09-25
- План: [plan.md](./plan.md)

## Порядок

После D-EXPORT — отдельная ветка/worktree. Каждый кодовый инкремент:
red → green → refactor. До согласования разрешён только проект документов.

## Контракты

- [ ] T0. Утвердить D-EXPORT, поля/заголовки CSV; согласовать семантику outcome
  с текущим состоянием 0056. Обновить spec/plan в ready, закрепить владение
  общими stage.proto/domain/adapter. Не ждать сходов 0058.
- [ ] T1. `proto/hema/v1/stage.proto`: новый admin RPC и проекции из плана,
  lint и `make generate`. При существующих outcome типах 0056 согласовать
  mapping до фиксации контракта, не создавать параллельную доменную модель.

## Server

- [ ] T2. `domain/bout_export_test.go` → типы и сортировка: AC-1/2/3/5/6,
  устойчивый порядок, незавершённый результат пуст, каждый ID один раз.
- [ ] T3. Тест существующего platform BoutConductor adapter → mapping
  outcome в BoutRef. Для базы normal из bout.Outcome(), для принятой 0056
  её authoritative результат. Не выводить winner сравнением очков в CSV.
- [ ] T4. `service/bout_export_test.go` → `bout_export.go`: nomination check,
  реальные stages/pools/bouts, группы/половины/финал/третье место, пустой/unknown,
  чтение без создания этапов/реконсиляции и без write-port calls.
- [ ] T5. `api/bout_export_handler_test.go` → handler: httptest + Connect,
  admin/non-admin/anonymous, empty rows, error mapping, полная выдача состояний.

## Web

- [ ] T6. `shared/lib/csv.test.ts`: formula/control-prefix случаи → opt-in
  `csvSafeText`; убедиться, что существующий quoting/числа не изменились.
- [ ] T7. `features/bout-export/lib/to-csv.test.ts` → mapper: все 24 колонки,
  их порядок, zero scores, blank outcome, безопасные тексты, Unicode/CRLF.
- [ ] T8. `app/api/admin/nominations/[id]/bouts/export/route.e2e.test.ts` →
  route: cookie, реальные proto fixtures, полный CSV, headers, no-store,
  401/403/404/500; ошибка источника не выдаёт обрезанный файл с HTTP 200.
- [ ] T9. Тест UI export button → компонент; подключить его к
  `nomination-schema-screen.tsx` и расширить
  тест screen: export до финала, empty nomination, правильный ID, admin only.

## Проверка

- [ ] T10. Проверить AC-8 на новой модели техисходов после интеграции 0056.
  Проверить, что CSV содержит только reason-code и никогда private note;
  публичные ответы не раскрывают причину. Если 0059 поставляется раньше,
  явно записать «не применимо до 0056» и перенести
  обязательный compatibility test в join 0056+0059; не отмечать AC-8 пройденным.
- [ ] T11. Targeted unit/API/BFF tests, `make test-all`,
  `cd server && go build ./...`,
  `cd web && pnpm exec tsc --noEmit && pnpm build`, lint по CI. Изменений SQL/DDL
  нет: новый migration integration test сам по себе не требуется.
- [ ] T12. Ручной файл с группами+сеткой сверить по ID/парам/счёту; открыть в
  табличном редакторе, проверить кириллицу и опасные текстовые префиксы;
  повторить после reopen/reset. Доказать отсутствие mutations при экспорте.
- [ ] T13. Обновить документы/индекс через координатора, записать ограничения
  текущего чтения и совместимость 0056; убрать worktree/ветку после объединения.

## Треки и параллельность

Один исполнитель ведёт фичу последовательно. Базу для неё можно дать параллельно
bulk roster после D-EXPORT/D-BULK; они не делят доменные файлы. Контракты и
адаптер с 0056/аренной фичей — общие: stage.proto изменяется последовательной
контрактной волной, adapter после предыдущего владельца либо одной явной
join-задачей. 0053/0054 не меняют nomination-schema-screen.tsx и подключение
export button от их UI-работ не зависит. Сгенерированные файлы из соседнего
worktree не копировать.

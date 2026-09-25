# Plan: Выгрузка отдельных боёв номинации

- Статус: draft
- Дата: 2026-09-25
- Спека: [spec.md](./spec.md)
- Условие: проект под D-EXPORT; реализация до решения не начинается.

## Обзор решения

Добавить административную проекцию экспорта в `StageAdminService`: stage уже
владеет этапами/пулами и читает бои через `BoutConductor`. BFF формирует CSV из
одного ответа. Новый модуль, межсхемные SQL JOIN и browser fan-out не нужны.

Проверенные опоры: `bout.proto` сейчас отдаёт только пару/порядок, без счёта и
state; `stage.domain.BoutRef` содержит state/score; service `results.go` и
`tournament_live.go` уже агрегируют группы/контейнеры плейоффа. Публичный
`results/export/route.ts` отдаёт места, его права и формат не менять. Новый
admin endpoint не должен повторять его публичную доступность.

## Контракты (proto)

`proto/hema/v1/stage.proto`, добавления без изменения старых номеров полей:

- `StageAdminService.GetNominationBoutExport(GetNominationBoutExportRequest)`
  → `GetNominationBoutExportResponse`.
- Request: `string nomination_id = 1`.
- Response: `repeated NominationBoutExportRow rows = 1`.
- Row:

| № | Поле | Тип |
| --- | --- | --- |
| 1 | nomination_id | string |
| 2 | nomination_title | string |
| 3 | stage_id | string |
| 4 | stage_title | string |
| 5 | stage_type | StageType (существующий) |
| 6 | stage_position | int32 |
| 7 | pool_id | string |
| 8 | pool_name | string |
| 9 | pool_number | int32 |
| 10 | bout_id | string |
| 11 | round_number | int32 |
| 12 | sequence_number | int32 |
| 13 | fighter_a | FighterRef (существующая проекция stage) |
| 14 | fighter_b | FighterRef |
| 15 | state | BoutState (существующий) |
| 16 | score_a | int32 |
| 17 | score_b | int32 |
| 18 | winner_side | ExportWinnerSide |
| 19 | result_kind | string |
| 20 | result_reason | string |

`ExportWinnerSide`: `UNSPECIFIED=0`, `FIGHTER_A=1`, `FIGHTER_B=2`, `DRAW=3`,
`NONE=4`, с префиксом `EXPORT_WINNER_SIDE_`. UNSPECIFIED у незавершённого;
NONE только для принятого завершённого исхода без победителя. `result_kind`:
пусто до finish, `normal` для обычного, `technical` после внедрения 0056.
`result_reason` — доменный код причины из 0056 или пустая строка; он разрешён
только в этой admin-проекции. Private note не включается в CSV ни при каких
правах. Публичным проекциям 0056 доступны kind/winner, но не причина. Строки
здесь — экспортные значения, не новый независимый источник правил исхода.

Если 0056 уже ввела подходящий общий тип результата, на контрактном шаге
согласовать его использование/маппинг с координатором; не вводить два разных
доменных winner enum. Текущее предложение export enum — только проекция CSV.

Ошибки: пустой ID → InvalidArgument, неизвестная nomination → NotFound,
нет/недостаточная роль → Unauthenticated/PermissionDenied, сбой чтения →
ошибка RPC целиком (не обрезанный успешный файл). Пустая существующая nomination
→ успешный пустой rows. Новая процедура защищена RequireAdmin.

## Server (модули и слои)

- Расширение `modules/stage`, зависимость только по существующему направлению
  stage → bout, без нового bounded context.
- `domain/bout_export.go`: собственная export row и стабильная сортировка.
- `service/bout_export.go`: сначала проверить nomination через
  `NominationProvider.NominationsByIDs`; читать реальные этапы через
  `repo.StagesByNomination`, пулы через `PoolsByStage`, затем `BoutsByPool`.
  Не вызывать материализующие/реконсилирующие чтения `StagesForNomination`,
  `GetLayout` или `buildBracket`: экспорт не должен создавать этапы/бои либо
  менять посев. Метаданные половин/финала именовать существующим чистым правилом
  stage (`domain.ContainerTitle` для bracket), не дублировать произвольные
  названия в BFF.
- Включить все реальные контейнеры этапа, включая не стоящие на арене. Собрать
  каждый bout ID один раз и проверить соответствие pool/nomination; ошибка
  источника не означает «пустой этап». Сортировка: stage.Position, stage.ID
  при равенстве позиции, pool.Number, pool.ID, bout.SequenceNumber, bout.ID.
- `stage/domain/domain.go`: дополнить `BoutRef` проекцией исхода. В
  `internal/platform/stage_bout_conductor.go` существующий адаптер мапит результат из
  bout API, только если бой finished. До 0056 источник — `bout.Bout.Outcome()`;
  после 0056 — её authoritative результат. BFF не сравнивает score для winner.
  Если BoutRef уже расширен 0056, переиспользовать его поля без повторной правки.
- `api/bout_export_handler.go`: mapping и админская ручка; существующая
  регистрация сервиса, проверить новую процедуру через real RBAC тест.
- `repo/`: только существующие чтения stage/bout; N+1 по пулам допустим для
  первого синхронного экспорта одной номинации, не делать запрос на каждый бой.
  Батч по пулам вводить лишь при измеренной проблеме, отдельным согласованным
  изменением порта, без случайного расширения task.
- `migrations/`: **DDL отсутствует**. Новых схем, таблиц, колонок, CHECK,
  UNIQUE/FK, индексов, сидов или backfill нет. Проекции читаются из имеющихся
  данных; export сам ничего не сохраняет.
- Wiring: новый конструктор/модуль не нужен, обновляется mapping существующего
  адаптера. Нового EDD-ADR не требуется.

## Web (FSD + BFF)

- `GET /api/admin/nominations/[id]/bouts/export` →
  `web/src/app/api/admin/nominations/[id]/bouts/export/route.ts`, Node runtime;
  cookie → Authorization → `stageAdminClient.getNominationBoutExport`.
  Если токена нет — 401 до RPC, 403 приходит от server; ошибки обрабатывать
  существующим `errorResponse`.
- Ответ: `Content-Type: text/csv; charset=utf-8`,
  `Content-Disposition: attachment; filename="bouts.csv"`,
  `Cache-Control: private, no-store`, UTF-8 BOM + RFC4180/CRLF через
  `shared/lib/csv.ts`. Фиксированный filename избегает вставки имени номинации
  в HTTP header.
- Фиксированный порядок заголовков/колонок v1:
  `nomination_id, nomination_title, stage_id, stage_title, stage_type,
  stage_position, pool_id, pool_name, pool_number, bout_id, round_number,
  sequence_number, fighter_a_id, fighter_a_name, fighter_a_club, fighter_b_id,
  fighter_b_name, fighter_b_club, state, score_a, score_b, winner_side,
  result_kind, result_reason`.
  CSV значения enum: stage_type `groups`/`bracket`; state
  `not_started`/`in_progress`/`finished`; winner_side `a`/`b`/`draw`/`none`
  либо пусто. Нулевые score не терять из-за proto3 omission.
- `features/bout-export/lib/to-csv.ts`: server-only mapper; текстовые ячейки
  перед `toCsv` пропускать через явно тестируемую нейтрализацию formula
  prefixes (включая ведущие control/whitespace перед `=+-@`). Существующий
  `csvEscape` делает только RFC4180 quoting и **не защищает от формул**.
  Добавить общий opt-in `csvSafeText` в `shared/lib/csv.ts`, не менять
  неявно семантику всех прежних экспортов. Numeric поля кодировать как числа.
- `features/bout-export/ui/export-bouts-button.tsx`: admin action и ссылка на
  BFF, без загрузки всех боёв в browser state; export URL helper отдельно
  от server-only CSV mapper. Кнопка «Экспорт боёв» добавляется в
  `widgets/nomination-schema/nomination-schema-screen.tsx` рядом с действиями
  номинации, не в публичные widgets. Наличие результатов мест не условие
  доступности: незавершённая/пустая nomination также экспортируется.
- Из-за использования существующего client сериализация не требует общего
  `lib/grpc/serialize.ts`: локальный mapper сохраняет explicit defaults.
  State — существующие данные экрана, нового RQ query/Zustand store нет.

## События

- Не издаёт/не потребляет новые события. Читает текущее состояние через API bout,
  не интерпретирует события сходов и не вводит новый journal.

## Тестирование

- Stage service с fake repo/BoutConductor: AC-1/2/3/5/6; группы, bracket halves,
  final/third place, duplicate IDs, пустая nomination vs unknown, стабильность,
  spy что ни один write-port не вызван.
- Adapter unit: outcome берётся из bout и отсутствует до finished; тест AC-8
  добавить при интеграции 0056, особенно winner не совпадает с большей score.
- API httptest + Connect/RBAC: valid rows, empty, 400/404/401/403/500;
  старые публичные методы не получают новый admin payload.
- BFF e2e: реальный proto ответ через `create(Schema, ...)`, Content-Type/BOM/
  disposition, score=0, отсутствующий исход, enum mapping и отсутствие
  успешного частичного файла при RPC ошибке.
- CSV unit: quoting, CRLF, Unicode, text formula neutralization/control chars,
  совпадение columns/headers, невмешательство в числа.
- UI Vitest: правильная nomination URL, admin action доступен до финальных
  результатов, public не получает action. Ручное открытие в табличном редакторе.

## Риски и открытые вопросы

- D-EXPORT блокирует переход к коду. Если нужен экспорт всего турнира, XLSX или
  журнал сходов — пересогласовать scope, не дописывать их по ходу реализации.
- 0056 меняет трактовку outcome: базовый экспорт независим, но финальная совместная
  приёмка требует AC-8. 0058 (сходы) не блокирует базовый CSV и не включается
  в него автоматически.
- Общие файлы с arena/outcomes: `stage.proto`, `stage/domain/domain.go`,
  существующий BoutConductor adapter в `internal/platform`, stage test fakes.
  0053/0054 не изменяют `nomination-schema-screen.tsx`, поэтому подключение кнопки
  не зависит от их UI-работ. С другими экспортами общий `shared/lib/csv.ts`.
  Изменения `stage.proto` выполнять в последовательной контрактной волне;
  изменения outcome/адаптера объединять после предыдущего владельца.
- Снимок не транзакционен между модулями: при одновременных правках файл может
  отражать разные моменты чтения разных боёв. Не рекламировать его как архив;
  каждый bout row должен быть внутренне согласован одной проекцией чтения.

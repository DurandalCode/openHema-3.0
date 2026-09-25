# Plan: Объяснимый отбор в следующий этап

- Статус: draft
- Дата: 2026-09-25
- Спека: `./spec.md`

> Условный проект на предложении D-0054-1/2: admin-only, актуальный preview.
> Это исключение из обычной последовательности оформления для запрошенного
> пользователем единого пакета на согласование. Исполнение блокируется до
> принятия решений; после ответа сверить весь план, а не только снять метки.

## Обзор решения

Расширить существующий `PreviewStageBuild` деталями уже выполняемого
конвейера, не вводить второй расчёт рейтинга в браузере. Сервис читает
источник для одного preview, из него строит результаты групп, сводный
порядок и объяснения. Состав/посев и все существующие гейты остаются прежними.

## Контракты (proto)

`proto/hema/v1/stage.proto`, существующий admin RPC
`PreviewStageBuild(PreviewStageBuildRequest) → PreviewStageBuildResponse`.
Аддитивно расширить `StageBuildPreview` после существующих полей 1–6:

- `repeated StageSelectionCandidate candidates = 7` — полный список
  источника с пояснением; existing `entries/unselected` не переопределять.
- `repeated StageSelectionSourceGroup source_groups = 8` — `pool_id`,
  `label`, `repeated PoolStanding standings`; не копия таблицы другим типом.
- `StageSelectionCandidate`: `FighterRef fighter`, `string source_pool_id`,
  `int32 overall_place` (0 = места нет), `PoolStanding standing` (unset,
  если источник-ростер или в группе ещё нет таблицы), enum `decision`
  (`UNSPECIFIED`, `SELECTED`, `NOT_SELECTED`, `PENDING`), enum `reason`
  (`UNSPECIFIED`, `RULE_MATCH`, `REPLACEMENT_FOR_INACTIVE`, `INACTIVE`,
  `OUTSIDE_SELECTION`, `TIE_PENDING`, `TIE_SELECTED`, `TIE_NOT_SELECTED`,
  `NO_RESULTS`), `string explanation` — готовый серверный текст.
  Связь с target slot/pool берётся из existing `entries` по fighterId,
  0 при переполнении не рендерится как «слот 0».
- Комментарии proto задают отсутствие значения, семантику решения «по
  правилу, до общих гейтов» и тот факт, что source groups/candidates относятся
  к этому расчёту. Номера новых полей сверить с базой контрактной волны.
- `BuildStage` и `TieResolution` не расширяются; код не обещает immutable
  snapshot между preview и build. Генерация `make generate`, gen не коммитить.

## Server (модули и слои)

Модуль `stage`, существующая PG-схема `stage`:

- `domain/selection_explanation.go` + тест: проекции кандидатов и объяснения,
  объединение standings с выбранными, неактивными и участниками без таблицы.
- `domain/seeding.go`: оставить `ComputeOverallOrder`, `SelectByRule`,
  `selectWindow` единственным источником решения. Для причин добора и
  фактически применённых ручных ответов добавить внутреннюю trace-проекцию
  к тому же проходу селектора либо helper, возвращающий её вместе с прежним
  результатом; существующий публичный интерфейс можно оставить wrapper.
  Нельзя определять добор условием `place > placeTo` в UI или считать любой
  присланный TieResolution фактически применённым.
- Не менять алгоритм ранжирования и окно отбора. Регрессионные fixtures
  должны доказать идентичность прежних entries/ties/seeds до/после расширения.
- `service/seeding.go`: обогатить `computeStageBuildPlan`. Загрузка групп
  удерживает текущие `Pool.Members` вместе с `Standings` из одного
  `loadLayout`; так группа без завершённых боёв не исчезнет из объяснения.
  Снятые бойцы со сыгранными результатами присутствуют в Standings, даже
  если уже отсутствуют среди Members. Не изобретать историю удалённых
  участников, которых нет ни в текущем составе, ни в результатах.
- Текущий `sourceGroupsForRule` используется и при проверке sibling rules:
  не раздувать все эти вызовы полным UI-расчётом; выделить внутренний loader
  с нужной проекцией и переиспользовать данные, не дублировать I/O на бойца.
- Данные fighter/bout — через существующие `ActiveFightersProvider` и
  bout-порт. Никаких прямых запросов в чужие PG-схемы.
- `api/selection_explanation.go` — новые proto-мапперы; точечное включение
  в `api/handler.go::toProtoStageBuildPreview`, e2e в `api/seeding_test.go`.
- `repo/`, SQL, миграции без изменений: новых таблиц/колонок/ограничений/
  индексов/сидов нет. История ответов не сохраняется. Wiring прежний.

## Web (FSD + BFF)

- `entities/stage/lib/types.ts`: DTO candidates/sourceGroups и enums.
- `lib/grpc/serialize.ts`: расширение `stageBuildPreviewToJson`, настоящий
  `toJson` и нормализация omitted-полей/enum; по возможности новые helpers
  в отдельном файле, интеграция в serialize только одним владельцем.
- `app/api/stages/[stageId]/build/preview/route.ts`: прежний POST REST,
  Node runtime и auth. E2E рядом с реальной сериализацией; запрет guest/user.
- `features/stage-build/ui/selection-explanation.tsx`: общая таблица,
  текст критериев, решения/причины, раскрываемые source-group таблицы через
  `entities/pool/ui/pool-standings-table.tsx` (переиспользовать без правок).
  Новая панель не импортирует другую feature или widget.
- `features/stage-build/ui/build-stage-dialog.tsx`: композиция панели рядом
  с existing assignments/ties, ограниченная высота с внутренней прокруткой;
  готовые причины общего запрета остаются у `lib/build-gate.ts`.
- `api/use-build-preview.ts`/`requests.ts`: прежний вызов с ties, запрос на
  открытие и явное обновление. Состояния запроса блокируют подтверждение;
  после изменения локальных ответов на дележ старый preview не подтверждать
  до успешного refresh с ровно этими ответами. Сервер пересчитывает build
  по актуальным данным по существующим правилам, UI не обещает обратного.
- State — текущие TanStack mutation/data и local resolutions, без нового
  глобального store. Смена stage/open сбрасывает ответы как сейчас.
- `widgets/stage-page/stage-page-screen.tsx`, публичные snapshot/routes,
  `features/bracket-seeding` не изменяются: существующий диалог вызывается
  из тех же мест. Ссылка на источник использует уже существующий admin route.

## События

Новых событий и межмодульной шины нет. Предложение не вводит live-пересборку
открытого preview: обновление явно по запросу, источники могут измениться
между отдельными операциями. Исторический журнал потребовал бы другого плана.

## Тестирование

- Независимый ручной эталон M04: 2 группы, разный размер, ничья, полный
  дележ, снятый участник; сверить 0016/0019 до правки объяснения. Несовпадение
  оформлять багом, не менять формулу под ожидаемый новый UI.
- Domain: AC-1..6/8, причины соответствуют реально использованной ветке
  селектора; дележ целиком внутри окна, добор, open-ended from/to, no results.
- Service с fake-портами: единый payload, отсутствие writes, источник и
  ограничения, сформированный этап не изменяется чтением.
- API httptest+Connect: новые поля, auth, прежние доменные ошибки.
- BFF e2e с create(Schema, partial): нулевые/omitted места и статистика,
  отсутствующий standing, enum roundtrip, нет моков serializer.
- UI: связность таблиц и assignments, ошибки/refresh/дележ, поздний ответ
  прошлого запроса не разблокирует новое решение, доступность/mobile.
- DB integration не добавляется для чистой проекции без SQL; полный
  `make test-all`, web tsc/lint/build, server build по DoD и браузерная приёмка.

## Владение, зависимости и параллельность

0054 зависит от решения D-0054-1/2 и проверки M04, но не от 0053. Контрактную
волну выполняет один владелец stage.proto/DTO. Затем backend
`stage/domain,service,api` и frontend `stage-build,BFF/serialize` можно
исполнять в отдельных worktree на общей смерженной базе контрактов.

Общие горячие файлы: `stage.proto`, `stage/domain/seeding.go`,
`stage/service/seeding.go`, `stage/api/handler.go`, `entities/stage/lib/types.ts`,
`lib/grpc/serialize.ts`. Их изменения ареной/техническими исходами/заменами
сериализуются по волнам. Новая панель UI может разрабатываться на
согласованных DTO-fixtures параллельно backend, но integration только после
его мержа. `stage-page-screen` и `bracket-seeding` этому треку не принадлежат.

## Риски и открытые вопросы

- D-0054-1/2 блокируют реализацию. Public/история меняют контракт и хранение.
- Не путать `unselected` старого API (покрытие веток) с новым полным списком
  решений текущей ветки; описать разницу, старое поле сохранить.
- Несколько чтений внутри existing loadLayout не дают транзакционной
  гарантии на весь турнир. Новая UI-проекция не должна заявлять её наличие;
  если нужна строгая фиксация preview, это отдельное продуктовое решение.
- Будущие технические исходы меняют вход статистики: после их интеграции
  прогнать регрессии объяснения, не реализовывать будущие enums здесь.

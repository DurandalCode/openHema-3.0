Реализуй назначенный трек HEMA по согласованному пакету.

Шапка запуска (заполняет координатор):
- BASE_COMMIT: <commit, содержащий пакет и зависимости>
- WORKTREE: <отдельный абсолютный путь>
- BRANCH: <ветка только этого трека>
- ПРИНЯТЫЕ РЕШЕНИЯ: <D-ID и запись в decisions.md>

Сначала проверь путь/ветку/status и наличие зависимостей в BASE_COMMIT.
Если шапка не заполнена или нужные решения не приняты, проверь документы
и сообщи конкретный blocker; условную реализацию не запускай.
Прочитай AGENTS.md и вложенные инструкции затрагиваемых папок,
применимый .agents/skills/tdd-cycle/SKILL.md, а также:
- docs/implementation/2026-09-feedback/decisions.md
- docs/implementation/2026-09-feedback/waves.md
- docs/implementation/2026-09-feedback/handoff.md

Трек: 0054-selection. Волна 2, после мержа 0052/0053.
Обязательные решения: D-0054-1, D-0054-2.
Прочитай и выполни:
- docs/specs/0054-selection-explainability/spec.md
- docs/specs/0054-selection-explainability/plan.md
- docs/specs/0054-selection-explainability/tasks.md

Границы: Ты владелец stage.proto и stage-build на свою волну. Не меняй формулу рейтинга и не выдавай актуальное preview за архив. Ручной эталон M04 обязателен. Не вводи public scope, если принят admin-only.

Веди работу автономно внутри согласованного scope: red → green → refactor,
API сначала в proto, gen/sqlc вручную не править. Выполни обязательные
проверки AGENTS/CI и все AC своего трека; визуальные/многоклиентские AC
не заменяй одним зелёным unit-прогоном. Используй отдельную тестовую БД
и порты. Не изменяй файлы другого владельца без согласованного переноса задачи.

Веди свой tasks.md и отчёт docs/implementation/2026-09-feedback/reports/0054-selection.md
(замени 0054-selection на имя этой задачи). Общие audit/index/decisions/waves не меняй.
Не мержи, не деплой и не меняй живой турнир. Сдай координатору branch/commit,
T-ID, diff summary, команды/результаты тестов, AC, миграции/риски/остатки.
Новую продуктовую развилку не решай молча; продолжай независимую работу.

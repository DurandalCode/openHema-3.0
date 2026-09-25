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

Трек: 0053-graph. Волна 1. Общая согласованная база пакета.
Основание запуска: подтверждённое направление A-GRAPH и разрешение готовых независимых задач, зафиксированное в decisions.md/launch-now.md.
Прочитай и выполни:
- docs/specs/0053-playoff-graph-view/spec.md
- docs/specs/0053-playoff-graph-view/plan.md
- docs/specs/0053-playoff-graph-view/tasks.md

Границы: Только граф/renderer и его UI интеграция. Не меняй proto, stage/bout бизнес-логику или вычисление победителя. FSD entity renderer общий admin/public. Учти длинные имена, bye, bronze, mobile и живое обновление.

Веди работу автономно внутри согласованного scope: red → green → refactor,
API сначала в proto, gen/sqlc вручную не править. Выполни обязательные
проверки AGENTS/CI и все AC своего трека; визуальные/многоклиентские AC
не заменяй одним зелёным unit-прогоном. Используй отдельную тестовую БД
и порты. Не изменяй файлы другого владельца без согласованного переноса задачи.

Веди свой tasks.md и отчёт docs/implementation/2026-09-feedback/reports/0053-graph.md
(замени 0053-graph на имя этой задачи). Общие audit/index/decisions/waves не меняй.
Не мержи, не деплой и не меняй живой турнир. Сдай координатору branch/commit,
T-ID, diff summary, команды/результаты тестов, AC, миграции/риски/остатки.
Новую продуктовую развилку не решай молча; продолжай независимую работу.

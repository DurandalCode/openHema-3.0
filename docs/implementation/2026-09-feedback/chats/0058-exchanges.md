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

Трек: 0058-exchanges. Волна 6, после 0052/0056/0057.
Обязательные решения: D-EXCH.
Прочитай и выполни:
- docs/specs/0058-bout-exchanges/spec.md
- docs/specs/0058-bout-exchanges/plan.md
- docs/specs/0058-bout-exchanges/tasks.md

Границы: Расширяй arena v2 command actions0052. Paired delta/history/replay должны быть единственным способом править итог после включения журнала. Не выдумывай legacy сходы/официальное время; no silent offline replay на новый бой.

Веди работу автономно внутри согласованного scope: red → green → refactor,
API сначала в proto, gen/sqlc вручную не править. Выполни обязательные
проверки AGENTS/CI и все AC своего трека; визуальные/многоклиентские AC
не заменяй одним зелёным unit-прогоном. Используй отдельную тестовую БД
и порты. Не изменяй файлы другого владельца без согласованного переноса задачи.

Веди свой tasks.md и отчёт docs/implementation/2026-09-feedback/reports/0058-exchanges.md
(замени 0058-exchanges на имя этой задачи). Общие audit/index/decisions/waves не меняй.
Не мержи, не деплой и не меняй живой турнир. Сдай координатору branch/commit,
T-ID, diff summary, команды/результаты тестов, AC, миграции/риски/остатки.
Новую продуктовую развилку не решай молча; продолжай независимую работу.

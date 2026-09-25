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

Трек: 0057-substitution. Волна 5, после 0055/0056 и 0052.
Обязательные решения: D-SUB.
Прочитай и выполни:
- docs/specs/0057-fighter-substitution/spec.md
- docs/specs/0057-fighter-substitution/plan.md
- docs/specs/0057-fighter-substitution/tasks.md

Границы: Только согласованная draft-only замена, если D-SUB не изменён. Это два разных человека, не Merge. Сначала ADR UoW и единый lock order0052; атомарность должна быть доказана DB integration. Нельзя расширять ready/active scope самому.

Веди работу автономно внутри согласованного scope: red → green → refactor,
API сначала в proto, gen/sqlc вручную не править. Выполни обязательные
проверки AGENTS/CI и все AC своего трека; визуальные/многоклиентские AC
не заменяй одним зелёным unit-прогоном. Используй отдельную тестовую БД
и порты. Не изменяй файлы другого владельца без согласованного переноса задачи.

Веди свой tasks.md и отчёт docs/implementation/2026-09-feedback/reports/0057-substitution.md
(замени 0057-substitution на имя этой задачи). Общие audit/index/decisions/waves не меняй.
Не мержи, не деплой и не меняй живой турнир. Сдай координатору branch/commit,
T-ID, diff summary, команды/результаты тестов, AC, миграции/риски/остатки.
Новую продуктовую развилку не решай молча; продолжай независимую работу.

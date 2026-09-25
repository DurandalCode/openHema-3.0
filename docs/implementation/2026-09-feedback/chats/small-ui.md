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

Трек: small-ui. Волна 2 после 0052; SF-03/06 после D-UX.
Прочитай docs/implementation/2026-09-feedback/small-fixes.md.
Только твои задачи: SF-02 (S-POOL), SF-03 (S-GROUPS), SF-06 (S-CAPACITY), SF-09 (S-RESULTS) и SF-01 (S-UNFIX) при воспроизведении.
Границы: Pool status filter, group tabs, count warning. Строго data gate SF-06: новый RPC требует отдельной спеки. Stage backend принадлежит 0054 в этой волне; SF-01 domain fix передай владельцу либо перенеси после него. Не меняй bracket renderer, stage-build или arena console.

Веди работу автономно внутри согласованного scope: red → green → refactor,
API сначала в proto, gen/sqlc вручную не править. Выполни обязательные
проверки AGENTS/CI и все AC своего трека; визуальные/многоклиентские AC
не заменяй одним зелёным unit-прогоном. Используй отдельную тестовую БД
и порты. Не изменяй файлы другого владельца без согласованного переноса задачи.

Не отмечай общий small-fixes.md параллельно; веди только отчёт docs/implementation/2026-09-feedback/reports/small-ui.md
(замени small-ui на имя этой задачи). Общие audit/index/decisions/waves не меняй.
Не мержи, не деплой и не меняй живой турнир. Сдай координатору branch/commit,
T-ID, diff summary, команды/результаты тестов, AC, миграции/риски/остатки.
Новую продуктовую развилку не решай молча; продолжай независимую работу.

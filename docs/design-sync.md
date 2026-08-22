# Синк с Claude Design — карта «экран/компонент → репозиторий»

> Источник истины для порта дизайна из `claude.ai/design` в `web/src`.
> Заменяет собой манифест самого дизайн-проекта (`github.md` внутри проекта)
> — тот пишет сторонний агент в отдельной сессии без доступа к актуальному
> коду, и уже содержит подтверждённые неточности (см. `docs/adr/0015-ui-redesign-porting-order.md`,
> раздел «Разведка»). Эта карта — то, что **мы** проверили Read/Grep по
> реальному репозиторию, а не то, что заявил дизайн-агент.

## Как этим пользоваться при следующем редизайне

1. Design-проект в `claude.ai/design` — **read-only источник**
   (`DesignSync(get_file)`/`DesignSync(list_files)`), ничего туда не пишем и
   не пушим (`write_files`/`delete_files`/`finalize_plan` и т.п. — не
   вызывать вообще, вне зависимости от типа проекта).
2. Манифест дизайн-проекта (если есть, напр. `github.md`) читается как
   **непроверенная подсказка**, не как факт: пути файлов, заявления «этого
   ещё нет в API», список экранов — всё сверяется с реальным репозиторием
   (Read/Grep по `web/src`, `proto/`, `docs/specs/`) до того, как попадёт в
   `spec.md`.
3. Разведка проводится **до** написания спек — читаем все релевантные
   `.dc.html` целиком, сверяем каждое заявление о «целевом файле» и «новой
   фиче» с кодом. При большом объёме (как в этом редизайне) разведку удобно
   распараллелить форками (см. `docs/adr/0015-ui-redesign-porting-order.md`,
   как это было сделано), но саму сверку с репозиторием форк обязан делать
   сам, не доверяя манифесту дизайн-проекта на слово.
4. Результат разведки фиксируется здесь (обновляется по ходу — раздел
   «Как поддерживать в актуальном состоянии» ниже), а сквозной порядок/имена
   будущих спек — в соответствующей ADR (сейчас — 0015).

## Проект «OpenHEMA» (redesign, 2026-08)

- id: `f5a761fd-ed71-4a5b-92f9-5690246f70af`
- URL: `https://claude.ai/design/p/f5a761fd-ed71-4a5b-92f9-5690246f70af`
- Тип: `PROJECT_TYPE_PROJECT` (не design-system)
- Порядок портирования и открытые/закрытые решения: `docs/adr/0015-ui-redesign-porting-order.md`

### Примитивы дизайн-системы → `web/src/shared/ui`

| Компонент дизайна | Целевой файл(ы) в репозитории | Стратегия |
| --- | --- | --- |
| `UiButton` | `shared/ui/button.tsx` | рестайл на месте (+вариант success) |
| `UiBadge` | `shared/ui/badge.tsx` | рестайл на месте (+tone-маппинг, pulse) |
| `UiTag` | `shared/ui/tag.tsx` (новый) | новый компонент, аналога нет |
| `UiField` | `shared/ui/input.tsx` + `label.tsx` + `select.tsx` | контролируемый компонент поверх существующих, не транскрипция мока |
| `UiFilterChip` | `shared/ui/filter-chip.tsx` (новый) | новый компонент, аналога нет |
| `UiTabs` | `shared/ui/tabs.tsx` | рестайл на месте (Radix, реальный content-switch уже есть) |
| `UiCard` | `shared/ui/card.tsx` | рестайл на месте (+stat-tile вариант) |
| `UiEmptyState` | `shared/ui/empty-state.tsx` (новый) | новый компонент, аналога нет |
| `UiModal` | `shared/ui/dialog.tsx` | рестайл на месте (Radix — focus-trap/ESC/ARIA уже есть, не переписывать с нуля) |
| `UiTableHead` | `shared/ui/table-head.tsx` (новый) | новый компонент, Table-примитива в репо нет |
| `UiTableRow` | `shared/ui/table-row.tsx` (новый) | новый компонент; спека 0025 добавила необязательный слот `node?: React.ReactNode` (рендерится вместо `text`/`sub`) — аддитивно, `cells`-API не сломано |
| `UiAppShell` + `AdminShell`/`AdminShellLight` | `shared/ui/app-shell.tsx` (topbar: `brand/nav/userSlot`) + `shared/ui/page-header.tsx` (заголовок раздела, вынесен спекой 0024, FR-19) + `widgets/admin-shell/admin-shell.tsx` | тема через `next-themes`, nav — по реальным роутам `admin-nav-links.tsx` (не по хардкоду дизайна, там фантомный пункт «Пульт» и подпись «Арены» вместо «Площадки»); `PageHeader` рендерится самим экраном, не layout'ом — см. `web/AGENTS.md` |
| `UiSideNav` | — не портируется | не используется реальными экранами, только «альтернатива» в галерее дизайна |
| `UiFighterCard` | `features/fighter-management/ui/fighter-card-dialog.tsx` (НЕ `shared/ui`, вопреки карте дизайн-проекта) | перенесена спекой `0026-fighters-redesign`, не фундаментом |

Токены: дизайн вводит новую hex-палитру (красный акцент) и свою систему
имён (`--bg-page`, `--fg`, ...), НЕ совпадающую с текущими shadcn/oklch
переменными (`--primary`, `--accent`, `--gold`, ... из спеки 0004, зелёный+
золото). Решение (ADR 0015, «Решения по открытым вопросам», п.1): **полный
ребрендинг** — существующие переменные в `web/src/app/globals.css`
перекрашиваются под новую палитру, один источник токенов.

### Экраны → repo (сверено с реальным кодом на 2026-08-12)

| Экран (`.dc.html`) | Repo-пути (сверено) | Новый API нужен? |
| --- | --- | --- |
| Пользователи | `docs/adr/0007-rbac-bootstrap.md`, `app/(admin)/admin/page.tsx`, `features/admin/ui/{users-screen,users-table,users-filters,user-row,create-admin-dialog}.tsx` (редизайн — спека 0024) | нет |
| Заявки | `app/(admin)/admin/applications/page.tsx`, `features/application-review/ui/{applications-screen,applications-table,applications-filters,application-row,application-card-dialog,application-history,edit-application-dialog}.tsx`, `entities/application/lib/{state,types}.ts` (редизайн — спека 0025) | **да** — `ApplicationEvent.actor_display_name` (имя автора события истории; макет подписывает историю именами, наружу отдавался только `actor_id`); обогащение на чтении, без новой персистентности |
| Бойцы | `entities/fighter`, `features/fighter-management/*`, `app/(admin)/admin/fighters/page.tsx` (редизайн — спека 0026) | **да** — `Fighter.from_application` (признак происхождения бойца: из заявки/заведён вручную; `origin_user_id` хранится с 0007, наружу не отдавался); аддитивное поле, без новой персистентности |
| Арены | `app/(admin)/admin/arenas/{page,[id]/page}.tsx`, `features/arena-management/*` (редизайн — спека 0027: `arenas-screen`/`arenas-table`/`arena-row`/`create-arena-dialog`/`edit-arena-dialog`, старый `arena-management.tsx` удалён), `entities/arena/lib/format.ts` + `entities/arena-live/lib/status.ts` (новые чистые модули 0027) | нет |
| Номинации (пропущен в github.md) | `app/(admin)/admin/nominations/page.tsx`, `features/nomination-management/ui/{nominations-screen,nominations-table,nomination-row,create-nomination-dialog,edit-nomination-dialog}.tsx` (редизайн — спека 0028: `nomination-management.tsx` удалён, действия строки — выпадающее меню, а не 8 иконок), `entities/stage/lib/labels.ts` (+`stageSchemaSummary`/`schemaErrorCount`, новые чистые функции 0028) | нет |
| Турнир и форматы | `app/(admin)/admin/{tournament,formats}/page.tsx`, `features/{tournament-settings,format-presets}/*`, `entities/tournament/{lib/{format,draft},ui/tournament-hero}.tsx` — **github.md ошибочно называет это «недостающими разделами», на деле готово целиком (спеки 0001, 0020)**; редизайн — спека 0029, живое превью главной внутри редактора | нет |
| Посев — группы | `features/nomination-pools/*`, `entities/pool/lib/types.ts` | нет |
| Схема номинации | `widgets/nomination-schema/nomination-schema-screen.tsx` (композиция, редизайн — спека 0031) + `{schema-diagnostics,schema-palette,schema-canvas,stage-card,stage-inspector,schema-skeleton}.tsx`, `features/{nomination-management,format-presets,stage-management}/*`, `entities/stage/lib/{labels,issues,schema-drag}.ts`. **Разведка 0015 ошиблась**: `widgets/nomination-schema/nomination-schema.tsx` (старый виджет, `mode="admin"\|"public"`) на деле имел живого потребителя `mode="public"` — `widgets/nomination-pools-public/nomination-pools-public.tsx` (публичная страница номинации), а не только `stage-management.tsx`, как считалось при планировании 0031; файл **не удалён**, сузился до единственной роли — read-only проекция для публичной страницы (спека 0035 решит его судьбу окончательно) | нет |
| Страница этапа | `widgets/stage-page/stage-page-screen.tsx` (композиция, редизайн — спека 0032) + `{stage-summary-cards,stage-actions,stage-rail,stage-page-skeleton}.tsx`, `features/{nomination-pools,bracket-seeding,stage-build,stage-management,nomination-live}/*`, `entities/{bracket/lib/types.ts (bracketRoundOneFilledCount), pool/lib/types.ts (poolCountWord), stage/lib/progress.ts (stageProgressFromSnapshot)}`. `app/(admin)/admin/.../stages/[stageId]/page.tsx` сузился до server-обёртки (`notFound()` + `initialStages` для `useStages`) — композиция переехала в виджет (NFR-2). Заодно отредизайнен `bracket-seeding`/`bracket-view` (0032, FR-21..FR-25) — единственная часть ветки без своего файла в дизайн-проекте | нет |
| Arena Scoreboard | `widgets/arena-scoreboard/*` (перестроена спекой 0033: полоса таймера сверху, пять фаз через `entities/arena-live/lib/scoreboard-phase.ts`, `appearance-toggle.tsx` — тумблер тёмное/светлое своей палитры, `next-themes` по-прежнему не читает), `features/arena-timer/ui/TimerDisplay.tsx` (презентационный — фазу считает вызывающий код) | нет |
| Secretary Panel | `widgets/arena-console/bout-panel-view.tsx` (спека 0033) — режим «Ведение боя» страницы площадки, тот же UI-паттерн, что «Страница арены» ниже. `features/arena-timer/ui/TimerControls.tsx` — колонка таймера (презентационная, `display`/`controls` пропами). Старый `features/bout-board/ui/bout-board.tsx` удалён спекой 0033 | нет |
| Страница арены | `app/(admin)/admin/arenas/[id]/page.tsx` → `widgets/arena-console/arena-console.tsx` (спека 0033): единственный `useArenaLive`+`useArenaTimer` на странице, режим — query-параметр `?mode=bout`, `management-view.tsx` (обзор) + `bout-panel-view.tsx` (панель) + `use-bout-score-control.ts` (общая офлайн-логика счёта) + `connection-bar.tsx`/`mode-switch.tsx` | **да** — `GetArenaJournal` в `StageAdminService` (журнал боёв площадки, FR-33): читает существующий event-sourced журнал боя (0013, ADR 0011), который до 0033 не отдавался наружу; новых миграций нет, `stage/domain.UserProvider` — приём 0025 |
| Публичная главная v2 (**не** «Публичная главная.dc.html», как в github.md) | `app/page.tsx` (сужается до server-обёртки), `widgets/home/*` (новая композиция — полоса турнира, площадки, лента боёв, сайдбар номинаций), `entities/tournament/ui/tournament-hero.tsx` (переехал из `widgets/tournament-hero/` спекой 0029 — вынужденно, чтобы тот же блок переиспользовало живое превью редактора турнира, `features → widgets` запрещён FSD; рестайлится на месте под афишу «до старта»), `widgets/nominations-list/*`, `entities/tournament-live/*` + `features/tournament-live/*` (новые, спека 0034) | **да** — разведка 0015 («нет») ошиблась: макет v2 — не рестайл текущей главной, а три состояния экрана, и состояние «турнир идёт» опирается на данные, которых в контракте нет. Спека 0034 вводит `GetTournamentLive`/`WatchTournamentLive` в `StagePublicService` (публичная живая сводка турнира: площадки + лента боёв всех номинаций одной подпиской — фан-аут N `WatchNominationLive` упирается в браузерный лимит ~6 соединений на хост, а свободные площадки публично не видны вовсе, `ArenaAdminService` admin-only) и фактическое время боя проекцией существующего событийного журнала (0013/ADR 0011, без миграций — приём `GetArenaJournal` спеки 0033). Экран 12a («Мои бои» вошедшего бойца) из этого же файла — **не порт визуала, а новая доменная фича**: требует связи учётка↔боец, разорванной 0007 и сознательно не восстановленной 0026 (NFR-2); вынесен из скоупа 0034 |
| Публичная — номинация | `app/nominations/[id]/page.tsx` (сужена до server-обёртки, редизайн — спека 0035), `widgets/nomination-public/*` (новая композиция: `nomination-public-screen`, `nomination-header`, `schema-chain`, `stage-promise`, `stage-section`, `pool-card`, `bout-row`, `empty-layout` — заменяет удалённый `widgets/nomination-pools-public/nomination-pools-public.tsx`), `widgets/bracket-view/*` (аддитивные правки 0035: `—:—` у неначатого боя, площадка на живой паре, выделенные блоки финала/бронзы), `entities/nomination-live/lib/position.ts` + `entities/stage/lib/schema-chain.ts` (новые чистые функции). Дуальный `widgets/nomination-schema/nomination-schema.tsx` (`mode="admin"\|"public"`), который разведка 0015 сочла имеющим только один живой публичный потребитель, спекой 0035 **удалён** вместе с `mode` — цепочка схемы зрителя (`schema-chain.tsx`) заменила его как самостоятельный компонент, не урезанная копия админского конструктора | нет |
| Публичная — заявки | `app/applications/page.tsx` (сужена до server-обёртки, редизайн — спека 0036) + `widgets/my-applications/*` (новая композиция: `my-applications-screen`), `app/nominations/[id]/apply/page.tsx` + `widgets/application-apply/*` (`apply-screen`, `apply-what-next` — новый экран 14a, которого в репозитории не было вовсе), `features/my-applications/ui/{application-card,apply-application-form,nomination-apply-cta}.tsx` (композиция карточки/формы/точки-входа переехала из фичи в виджеты и наоборот по правилу 0032; старые `submit-application-button.tsx`/`my-applications-list.tsx` удалены), статусы совпадают 1:1 с `entities/application/lib/state.ts` (+ `stateTone`/`applicationFunnel`, новые чистые функции 0036) | нет — карта подтвердилась: подача/отзыв/оплата/список — существующие RPC модуля `application` (0005/0006), название номинации join'ится на чтении публичным справочником нominations (приём 0025), единственная правка вне UI — BFF `POST /api/applications` различает `AlreadyExists`/`FailedPrecondition` под одним 409 человеческим текстом |
| Вход, кабинет, о платформе | текущий `/about` — заглушка, `/dashboard` — только карточка профиля | **да** — сброс пароля (RPC+email отсутствуют), поля `Tournament` «главный судья»/регламент-PDF отсутствуют в proto |

### Drafts — архив, не переносить

`drafts/AdminShell.dc.html`, `drafts/AdminShellLight.dc.html` (старые версии
до объединения в `UiAppShell`), `drafts/Playoff Bracket.dc.html` (сетка уже
встроена напрямую в `stages/[stageId]/page.tsx`, ссылка на этот файл из
«Схема номинации.dc.html» устарела), `drafts/Конструктор номинации
(концепт).dc.html` (сам дизайн-проект помечает как «концепт, в реализацию не
берём»), `drafts/Публичная главная v1.dc.html` (заменена v2).

`drafts/Tournament Console.dc.html` — единственный не архивный по сути
черновик (живой операционный дашборд: очередь боёв, прогноз по номинациям),
но **не покрыт текущим API** и вопреки ошибочному объяснению в
`Drafts.dc.html` не является тем же самым, что «Турнир и форматы». Решение
(ADR 0015, п.3): не рассматривается в этой инициативе, без резервирования
места.

## Как поддерживать в актуальном состоянии

При каждой новой спеке из порядка ADR 0015 — если разведка при `plan.md`
находит расхождение с этой картой (repo-путь переехал, компонент
переименован), обновить соответствующую строку здесь, а не оставлять карту
протухать молча.
</content>

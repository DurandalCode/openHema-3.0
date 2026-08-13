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
| Арены | `app/(admin)/admin/arenas/{page,[id]/page}.tsx`, `features/arena-management/*`, `entities/{arena,arena-live}` | нет |
| Номинации (пропущен в github.md) | `app/(admin)/admin/nominations/page.tsx` (спека 0003) | нет |
| Турнир и форматы | `app/(admin)/admin/{tournament,formats}/page.tsx`, `features/{tournament-settings,format-presets}/*` — **github.md ошибочно называет это «недостающими разделами», на деле готово целиком (спеки 0001, 0020)** | нет |
| Посев — группы | `features/nomination-pools/*`, `entities/pool/lib/types.ts` | нет |
| Схема номинации | `widgets/nomination-schema/*`, `features/{nomination-management,stage-management}/*` | нет |
| Страница этапа | `app/(admin)/admin/.../stages/[stageId]/page.tsx` — новая композиция существующих RPC (`SelectByRule` preview, undo build-снапшот из спеки 0019), не новый функционал | нет |
| Arena Scoreboard | `widgets/arena-scoreboard/*`, `features/arena-timer/ui/TimerDisplay.tsx` | нет |
| Secretary Panel | `features/bout-board/*`, `features/arena-timer/ui/TimerControls.tsx` — тот же UI-паттерн, что режим «Ведение боя» на «Странице арены» | нет |
| Страница арены | `app/(admin)/admin/arenas/[id]/page.tsx` — нужен новый паттерн композиции (переключатель режимов «Управление»/«Ведение боя» на одном URL), домен не меняется | нет (архитектурный UX-паттерн, не API) |
| Публичная главная v2 (**не** «Публичная главная.dc.html», как в github.md) | `app/page.tsx`, `widgets/{tournament-hero,nominations-list}/*` | нет |
| Публичная — номинация | `app/nominations/[id]/page.tsx`, `widgets/{nomination-pools-public,bracket-view}/*` | нет |
| Публичная — заявки | `app/applications/page.tsx`, `features/my-applications/*` (статусы совпадают 1:1 с `entities/application/lib/state.ts`) | нет |
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

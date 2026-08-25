# Plan: Хвосты редизайна и сквозные клиентские паттерны

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-08-25
- Спека: `./spec.md`

## Обзор решения

Инкремент целиком клиентский: `/proto`, Go-сервер и схема БД не меняются
(NFR-1). Пять блоков спеки ложатся на три новых сквозных механизма и две
точечные правки:

- **Сквозные**: чистая функция состава публичного меню + нижняя навигация
  (блок B), guard несохранённых изменений как «store + хук + один диалог в
  layout» (блок C), единая точка клиентского запроса `apiFetch`, из которой
  401 выходит уже как `UnauthorizedError` (блок D).
- **Точечные**: факты турнира в афише (блок A) и клавиатурный путь к переносу
  бойца в двух экранах посева (блок E).

Приём «store + хук + один диалог, смонтированный в `app/layout.tsx`» —
не новый: ровно так спека 0038 сделала диалог истёкшей сессии
(`shared/lib/session-expired-store.ts` + `widgets/session-expired/`). Guard
повторяет эту схему, а не изобретает свою.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

**Не меняются** (NFR-1). Все данные блока A уже приходят: `Tournament` несёт
`venueName`/`venueAddress`/`entryFeeMinor`/`entryFeeCurrency`/`regulationsUrl`
(0037), тип на клиенте — `entities/tournament/lib/types.ts`; число площадок
берётся из уже запрашиваемой главной живой сводки
(`TournamentLiveSnapshotDto.arenas`), а не из нового поля.

Если при реализации какой-то пункт упрётся в контракт — он не расширяет эту
спеку, а переезжает в 0040/0041 (ADR 0017, «Границы»).

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

**Не затрагивается.** Ни одного файла в `/server`. `make test` для сервера
остаётся зелёным без изменений; в CI сработает path-фильтр только на web.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

BFF (`app/api/**`) не меняется: новых маршрутов нет, существующие уже
возвращают 401 там, где сессия нужна, — блок D меняет только то, как клиент
эту 401 читает.

### Блок A — факты турнира в афише (FR-1..FR-5)

| Файл | Что делаем |
| --- | --- |
| `entities/tournament/lib/format.ts` | + `venueLine(t): string` — «название, адрес» с пропуском пустых. Сегодня та же склейка живёт инлайном в `widgets/tournament-about/about-facts.tsx`; после переезда виджет зовёт хелпер (дедуп, один формат в обоих местах). `formatEntryFee` уже есть — переиспользуем как есть |
| `entities/tournament/ui/regulations-link.tsx` | Переезд `widgets/tournament-about/about-regulations.tsx` на уровень `entities` — блок нужен обоим экранам, а `entities` не может импортировать `widgets` (FSD). Разметка и текст без изменений; старый файл и его тест удаляются, тест переезжает вместе с компонентом |
| `entities/tournament/ui/tournament-hero.tsx` | + строка фактов (место, взнос, площадки) и ссылка регламента. Новый **опциональный** проп `arenasCount?: number` — компонент остаётся презентационным и не ходит за площадками сам |
| `widgets/tournament-about/tournament-about-screen.tsx` | Импорт `RegulationsLink` из `entities`, `AboutFacts` — на общий `venueLine` |
| `widgets/home/home-screen.tsx` | Передаёт `arenasCount={liveSnapshot.arenas.length}` в `TournamentHero` (фаза `before` — снапшот уже есть на странице, нового запроса не появляется) |

Живое превью профиля турнира (`features/tournament-settings`, 0029 FR-3)
рендерит тот же `TournamentHero` и потому получает место/взнос/регламент
бесплатно — именно то, чего от превью и ждут: правишь поле, видишь афишу.
`arenasCount` превью не передаёт (площадки — не его данные), счётчик там
скрыт по тому же правилу FR-5, что и любое незаданное поле.

### Блок B — публичная навигация (FR-6..FR-12)

| Файл | Что делаем |
| --- | --- |
| `shared/lib/public-nav-items.ts` | **Новое.** Чистая функция `publicNavItems({ phase, isAuthenticated }): NavItem[]` — единственный источник состава меню для обоих его представлений |
| `shared/config/site-config.ts` | `navItems` остаётся базой фазы «до старта»; функция выше строит остальные фазы поверх него |
| `entities/tournament-live/model/get-public-phase.ts` | **Новое, server-only.** `getPublicPhase(): Promise<TournamentPhase>` = `getActiveTournament()` → `getTournamentLive(id)` → `tournamentPhase(snapshot.nominations)`. Тот же путь и та же чистая функция, которой пользуется главная — навбар и страница не могут разойтись в оценке фазы (иначе FR-7 нарушался бы через раз) |
| `entities/tournament/model/get-active-tournament.ts`, `entities/tournament-live/model/get-tournament-live.ts` | Обернуть в React `cache()` — дедуп в пределах одного рендера. На главной навбар не добавляет ни одного gRPC-вызова (страница уже зовёт обе функции), на прочих публичных страницах цена — один дополнительный `GetTournamentLive` (NFR-3) |
| `widgets/navbar/navbar.tsx` | Зовёт `getPublicPhase()`, передаёт готовый список пунктов в `NavLinks` |
| `widgets/navbar/nav-links.tsx` | Принимает `items` пропом вместо чтения `siteConfig` — рендер, подсветка активного и скрытие в админке не меняются |
| `widgets/navbar/mobile-nav.tsx` | **Новое.** Нижняя панель, `md:hidden`, `fixed inset-x-0 bottom-0`, иконка + подпись на пункт, `aria-current` на активном (переиспользует `isActiveNavItem`), скрыта в админ-зоне (`isAdminRoute`, как `NavbarVisibilityGate`) |
| `app/layout.tsx` | Монтирует `MobileNav` внутри существующего `NavbarVisibilityGate`; `main` получает нижний отступ на узком экране, чтобы панель не перекрывала контент; `Toaster` — позицию выше панели на мобильном |
| `shared/config/site-config.test.ts` | Расширяется до проверки по фазам (см. «Тестирование») |

**Состав пунктов по фазам** — выведен из того, что главная реально рендерит
(0034), а не из макета:

| Фаза | Гость | Дополнительно вошедшему |
| --- | --- | --- |
| `before` | Турнир `/#tournament` · Номинации `/#nominations` · О турнире `/about` | Мои заявки `/applications` |
| `running` | Сейчас `/#arenas-now` · Номинации `/#nominations-rail` · О турнире `/about` | Кабинет `/dashboard` |
| `finished` | Итоги `/#bout-feed` · Номинации `/#nominations-rail` · О турнире `/about` | Мои заявки `/applications` |

Почему так:

- В фазе `running` секций `#tournament` и `#nominations` на главной **нет** —
  их место занимают `TournamentStrip`, `ArenasNow`/`BoutFeed` и
  `NominationsRail` (`widgets/home/home-screen.tsx`). Сегодняшнее меню в день
  турнира ведёт в пустоту; это и есть баг из FR-7.
- `ArenasNow` рендерится только в `running` (в `finished` площадки уже не
  актуальны — 0034 FR-23), поэтому в `finished` живой пункт указывает на
  ленту боёв, а не на площадки.
- «Мои бои» отдельным пунктом не заводим: в `running` вошедшему нужен
  кабинет — там и следующий бой (0038 поверх ADR 0016), и превью своих
  заявок (`widgets/dashboard/my-applications-preview.tsx`). Поэтому в
  `running` «Мои заявки» из меню уходит: четыре пункта — потолок для нижней
  панели, а заявки в этой фазе на один клик глубже.

### Блок C — guard несохранённых изменений (FR-13..FR-16)

| Файл | Что делаем |
| --- | --- |
| `shared/lib/unsaved-guard-store.ts` | **Новое.** Zustand-стор (UI-state, ADR 0006): `dirtyReason: string \| null`, `pendingHref`, `setDirty`, `request(href)`, `confirm`, `cancel` |
| `shared/lib/use-unsaved-guard.ts` | **Новое.** `useUnsavedGuard(isDirty, reason)` — пишет признак в стор, вешает/снимает `beforeunload`, чистит признак при размонтировании |
| `widgets/unsaved-guard/unsaved-guard-dialog.tsx` | **Новое.** Слушатель кликов на `document` в capture-фазе: ближайший `a[href]`, внутренний, без `target="_blank"`, без модификаторов и без `data-unsaved-guard="ignore"` → `preventDefault` + `ConfirmDialog` (0023). Подтверждение — `setDirty(null)` и `router.push(href)`; отказ — остаёмся |
| `app/layout.tsx` | Монтирует `UnsavedGuardDialog` рядом с `SessionExpiredDialog` |
| `features/tournament-settings/ui/tournament-screen.tsx` | Подключает хук: dirty = непустой `tournamentDraftChanges` (та же величина, что уже питает `UnsavedChangesBar`) |
| `widgets/nomination-schema/stage-inspector.tsx` | Подключает хук: dirty = локальный ввод параметров/правила отличается от сохранённого |

Экраны, где каждое действие — самостоятельная мутация (посев групп и сетки,
площадки, пресеты, номинации), хук не подключают: терять нечего (FR-16).
Форма подачи заявки тоже не подключает — её черновик переживает уход со
страницы (`features/my-applications/model/apply-draft`).

**Известное ограничение**: перехватываются клики по ссылкам и закрытие/
перезагрузка вкладки. Кнопка «назад» **браузера** не перехватывается: в
Next 15.1 (текущая версия web) нет ни `Link.onNavigate` (появился в 15.3),
ни публичного способа отменить `popstate`-навигацию App Router; трюк с
подменой истории даёт ложные срабатывания и ломает «вперёд». Это записано
в риски и в спеке отражено формулировкой FR-14 («назад приложения» —
ссылки и кнопки самого приложения, они ссылки и есть).

### Блок D — сквозной перехват «неаутентифицирован» (FR-17..FR-20)

| Файл | Что делаем |
| --- | --- |
| `shared/api/api-fetch.ts` | **Новое.** `apiFetch<T>(input, init): Promise<ApiResult<T>>`. Сетевой сбой ловится внутри и возвращается как `{ ok: false }`; **401 бросается `UnauthorizedError` вне сетевого `try`** — иначе существующие `catch { return "Сеть недоступна" }` проглотили бы его. Дальше срабатывает уже готовая цепочка 0038: `QueryCache`/`MutationCache.onError` → тихое продление → диалог |
| `features/*/api/requests.ts`, `features/*/api/use-*.ts` | Перевод на `apiFetch` — 17 файлов (16 из плана + `features/profile/api/requests.ts`, чтобы не оставлять второй, свой узор `ensureAuthorized` рядом со стражем NFR-5 — перечень в `tasks.md`). Исключения: `features/auth/api/requests.ts` (FR-19 — там 401 значит «неверные учётные данные») и четыре публичных живых хука без авторизации `tournament-live/use-tournament-live.ts`, `nomination-live/use-nomination-live.ts`, `nomination-live/use-live-snapshot.ts`, `arena-live/use-arena-live.ts` (FR-20; изначально в этой строке фигурировали «три» — `use-live-snapshot.ts` нашёлся при реализации как ещё один потребитель того же публичного роута) |
| Экраны с собственной ошибкой загрузки | Добавляют уже принятое в 0038 правило `error instanceof UnauthorizedError → null` (образцы: `widgets/my-applications/my-applications-screen.tsx`, `widgets/dashboard/my-applications-preview.tsx`): бойцы, номинации, схема, посев групп и сетки, пресеты, заявки админа, журнал и панель площадки |
| `shared/api/no-direct-fetch.test.ts` | **Новое, тест-страж (NFR-5).** Читает `features/**/api/**` и падает, если файл вызывает `fetch(` напрямую и не входит в явный allowlist. Так правило достаётся новой фиче по умолчанию, а не «если автор вспомнил» |

### Блок E — клавиатурный путь в посеве (FR-21..FR-25)

| Файл | Что делаем |
| --- | --- |
| `features/nomination-pools/ui/nomination-pools.tsx` | На карточке бойца — меню «Переместить» (`shared/ui/dropdown-menu`): пункты всех пулов + «В нераспределённые»; зовёт те же `assign`/`unassign`, что и перетаскивание. Кнопка меню имеет `aria-label` с именем бойца и текущим местом |
| `features/bracket-seeding/ui/bracket-seeding.tsx` | То же для сетки: «Поставить в слот…» со списком свободных слотов и «Снять со слота» |
| оба файла | Успех объявляется тостом (`sonner`, `role="status"` — программа чтения с экрана его читает), текст — «Иванов → Пул 2» |

**`KeyboardSensor` из `@dnd-kit` отклонён.** Он требует измерений
(`getBoundingClientRect`) для поиска соседнего droppable, а в jsdom все
прямоугольники нулевые — тест такого пути был бы фикцией. Меню действий
детерминированно, тестируется обычным `userEvent`, и соответствует уже
принятому правилу 0031 (NFR-4): у каждого действия перетаскивания должен
быть эквивалент кнопкой или полем. Перетаскивание мышью не трогаем (FR-25).

### Server components vs client

- Серверные: `Navbar` (уже), новый `getPublicPhase` (server-only).
- Клиентские: `NavLinks` (уже), `MobileNav`, `UnsavedGuardDialog`, экраны
  посева, все переведённые на `apiFetch` фичи.
- State: server-state — TanStack Query (без изменений); UI-state — Zustand
  (`unsaved-guard-store`, по образцу `session-expired-store`); локальное —
  `useState`.

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей).

- Издаёт: нет.
- Потребляет: нет.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл). Серверных тестов нет —
> `/server` не затронут.

**Блок A**
- `entities/tournament/lib/format.test.ts` — `venueLine`: обе части, одна
  часть, ни одной.
- `entities/tournament/ui/tournament-hero.test.tsx` — место/взнос/площадки/
  регламент показываются; каждое поле по отдельности скрывается при пустом
  значении (AC-2); `arenasCount` не передан → счётчика нет.
- `entities/tournament/ui/regulations-link.test.tsx` — переехавший тест.
- `widgets/home/home-screen.test.tsx` — в фазе `before` в афишу уходит число
  площадок из снапшота (AC-3).

**Блок B**
- `shared/lib/public-nav-items.test.ts` — состав по трём фазам × (гость /
  вошедший); в `running` нет пунктов на `#tournament` и `#nominations`.
- `shared/config/site-config.test.ts` — расширяется: для каждой фазы якоря
  пунктов должны входить в множество секций, которые главная рендерит
  **в этой фазе** (AC-4). Список секций по фазам — рядом с тестом, как
  сегодняшний `KNOWN_PAGE_ANCHORS`.
- `widgets/navbar/mobile-nav.test.tsx` — пункты те же, что у широкого меню;
  активный помечен `aria-current`; в `/admin/**` не рендерится (AC-7, AC-8).

**Блок C**
- `shared/lib/use-unsaved-guard.test.ts` — признак ставится/снимается,
  `beforeunload` вешается и снимается при размонтировании.
- `widgets/unsaved-guard/unsaved-guard-dialog.test.tsx` — клик по внутренней
  ссылке при dirty открывает подтверждение и не уходит (AC-9); подтверждение
  зовёт `router.push`; при чистом состоянии переход обычный (AC-10); внешняя
  ссылка и `target="_blank"` не перехватываются.
- `features/tournament-settings/ui/tournament-screen.test.tsx` — после
  сохранения признак снят (AC-10).

**Блок D**
- `shared/api/api-fetch.test.ts` — 401 бросает `UnauthorizedError` (в том
  числе когда тело ответа не JSON), сетевой сбой возвращает `ok:false`,
  успешный ответ разбирается.
- По одному тесту-образцу на каждый переведённый срез (fetcher бросает
  `UnauthorizedError` на 401) — в первую очередь бойцы, номинации, посев,
  пресеты, заявки админа (AC-12).
- `widgets/*` экранов — при `UnauthorizedError` собственная ошибка не
  рисуется (AC-12).
- `features/auth/api/requests.test.ts` — 401 остаётся ошибкой формы (AC-13).
- `shared/api/no-direct-fetch.test.ts` — страж (NFR-5).

**Блок E**
- `features/nomination-pools/ui/nomination-pools.test.tsx` — перенос через
  меню зовёт `assign`/`unassign` с теми же аргументами, что и drop; тост с
  результатом (AC-14); в режиме `readOnly` меню недоступно.
- `features/bracket-seeding/ui/bracket-seeding.test.tsx` — постановка в слот
  и снятие через меню (AC-15); перетаскивание мышью не сломано (AC-16).

**Проверка целиком**: `make test-web`, `pnpm exec tsc --noEmit`, `pnpm build`.

## Риски и открытые вопросы

- **Кнопка «назад» браузера вне guard** (см. блок C). Осознанное
  ограничение текущей версии Next; при обновлении на 15.3+ закрывается
  через `Link.onNavigate` — отдельной мелкой правкой, без спеки.
- **Перехват кликов capture-фазой** может задеть чужие обработчики (Radix,
  меню, `ConfirmDialog`). Сужаем: только `a[href]`, только внутренние, без
  модификаторов, с явным опт-аутом `data-unsaved-guard="ignore"`. Если
  всплывут конфликты — сузить до контейнера страницы.
- **Цена фазы в навбаре** (NFR-3): `cache()` даёт бесплатность только внутри
  одного рендера. На публичных страницах, которые сегодня не зовут живую
  сводку (`/about`, `/applications`, `/nominations/[id]`), появится один
  дополнительный gRPC-вызов. Если это окажется заметно — запасной вариант
  вычислять фазу из уже загружаемого списка номинаций, но тогда придётся
  доказать, что она совпадает с `tournamentPhase` на всех переходах;
  начинаем с точного варианта.
- **Массовая правка 21 файла в блоке D** — механическая, но большая. Разбита
  в `tasks.md` на волны по срезам, чтобы падение было локальным.
- **Тест-страж на прямой `fetch(`** — в репозитории нет прецедента тестов,
  читающих исходники. Если окажется хрупким на путях/CI, его допустимо
  свести к проверке одного каталога `features/*/api` без рекурсии.
- **Нижняя панель и тосты** могут перекрыть друг друга на узком экране —
  проверяется вручную вместе с отступом `main`.

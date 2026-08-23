# Plan: Вход, кабинет, о турнире

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-08-23
- Спека: `./spec.md`

## Обзор решения

Инкремент почти целиком web-овый: 0037 уже дал все ручки, кроме одной. На
сервере добавляется **единственный RPC** — `FighterService.GetMyFighter`
(пользователь читает своего бойца в активном турнире): всё, что для него
нужно, в модуле `fighter` уже есть — `Repository.FindByOrigin` (дедуп 0007) и
`ActiveTournamentProvider` (как у `ListRoster`). Ни миграций, ни новых
sqlc-запросов, ни новых межмодульных портов.

Прогресс по номинациям и ближайший бой **не** получают своей серверной сводки:
`GetTournamentLive` (0034) уже отдаёт ленту боёв всех номинаций с
`FighterRef.fighter_id`, площадкой, этапом, пулом, номером боя и счётом —
кабинет считает «моё» из неё чистыми функциями и подписывается тем же
`useTournamentLive`, что публичная главная (spec, решение 4).

Продление сессии (FR-14) делается middleware'ом Next.js: он — единственное
место в App Router, где можно и прочитать cookie до рендера, и записать новые
в ответ (в Server Component `cookies().set` запрещён). Экран «Сессия истекла»
(FR-15) поднимается по флагу, который тот же middleware ставит, когда
продление не удалось, и по `UnauthorizedError` от клиентских запросов кабинета
(FR-18).

Восстановление связи «учётка → свой боец» разворачивает границу спеки 0007,
поэтому оформляется отдельной **ADR 0016** (`docs/adr/0016-account-fighter-self-link.md`)
— решение и его границы (только владелец, только чтение, только активный
турнир, админка не меняется) фиксируются там, а не внутри UI-спеки.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

Файл: `proto/hema/v1/fighter.proto`

Новый сервис (третий в модуле, по установленному в репозитории делению
`XService` / `XAdminService` / `XPublicService` — ср. `application.proto`):

```proto
// FighterService — чтение своего бойца пользователем (спека 0038, FR-38).
// Требует access-токен: в publicProcedures интерсептора Auth НЕ добавляется.
service FighterService {
  rpc GetMyFighter(GetMyFighterRequest) returns (GetMyFighterResponse);
}

// tournament_id опционален: пустой — активный турнир (как ListRosterRequest).
message GetMyFighterRequest {
  optional string tournament_id = 1;
}

// fighter не заполнен, если у пользователя нет бойца в турнире (FR-41):
// «бойца нет» — нормальный ответ, не ошибка.
message GetMyFighterResponse {
  Fighter fighter = 1;
}
```

Существующее сообщение `Fighter` переиспользуется как есть: в нём уже есть
`participations`, `status`, `withdrawal_reason` и `from_application`, а
`origin_user_id` наружу по-прежнему не отдаётся (FR-39/FR-42 — ответ и так
адресован владельцу, отдавать ему его же id смысла нет).

Изменений в `auth.proto`, `tournament.proto`, `stage.proto` нет: сброс/смена
пароля, правка профиля и поля турнира сделаны 0037, живая сводка — 0034.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

Модуль: `modules/fighter/` — расширение. PG-схема не меняется (миграций нет).

- `domain/` — **без изменений**. Порт `Repository.FindByOrigin(ctx,
  tournamentID, originUserID)` и `ActiveTournamentProvider.ActiveTournamentID`
  уже объявлены и реализованы (0007).
- `service/my_fighter.go` (новый файл, чтобы не раздувать `service.go`):

  ```go
  func (s *Service) MyFighter(ctx context.Context, userID, tournamentID string) (domain.Fighter, error)
  ```

  - `userID` пустой → `domain.ErrInvalidInput` (не обращаемся к БД);
  - `tournamentID` пустой → `s.tournaments.ActiveTournamentID(ctx)`, ошибка →
    `domain.ErrNotFound` (тот же приём, что `ListRoster`);
  - далее `s.repo.FindByOrigin(ctx, tournamentID, userID)` — результат и
    `ErrNotFound` прокидываются как есть; трактовку «нет бойца» решает `api`.
- `repo/` — **без изменений**: запрос `FindFighterByOrigin` (`repo/queries/fighter.sql`)
  и метод `FindByOrigin` существуют с 0007. `make sqlc` не нужен.
- `api/me_handler.go` (новый) — реализация `hemav1connect.FighterServiceHandler`:
  - `connectutil.CallerID(ctx)` — идентификатор вызывающего (приём
    `ApplicationService.ListMyApplications`); пустой → `CodeUnauthenticated`
    (страховка на случай, если RPC ошибочно попадёт в `publicProcedures`);
  - `domain.ErrNotFound` → **пустой успешный ответ**, а не `CodeNotFound`
    (FR-41). Это единственное место, где хендлер модуля осознанно расходится с
    общим `mapError` — отмечается комментарием;
  - остальные ошибки — через существующий `mapError`.
- `module.go` — `Deps` не меняются; в `Register` добавляется третий хендлер:

  ```go
  meHandler := api.NewMeHandler(svc)
  mePath, meH := hemav1connect.NewFighterServiceHandler(meHandler, baseOpts...)
  mux.Handle(mePath, meH)
  ```

  `baseOpts` включают интерсептор `Auth`, а `/hema.v1.FighterService/GetMyFighter`
  в `publicProcedures` **не добавляется** — значит RPC требует токена
  (default-deny интерсептора, `server/pkg/connectutil/auth_interceptor.go`).
- `migrations/` — **нет**. Персистентность связи (`origin_user_id` +
  partial-unique `(tournament_id, origin_user_id)`) заведена миграцией
  `00001_init.sql` ещё в 0007.
- Межмодульные зависимости: новых нет.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

### BFF (Route Handlers, Node runtime)

- `app/api/fighters/me/route.ts` (новый) — `GET`. Нет access-cookie → `401`.
  Иначе `fighterClient.getMyFighter({})` с `Authorization: Bearer …` →
  `{ fighter: FighterJson | null }` (`null`, если сервер вернул пустого).
  Нужен новый клиент `fighterClient` (`FighterService`) в `lib/grpc/client.ts`
  рядом с `fighterAdminClient`/`fighterPublicClient`, и `fighterToJson` в
  `lib/grpc/serialize.ts` (сериализация `Fighter` уже есть у админского
  ростера — переиспользуется, не дублируется).
- `app/api/auth/refresh/route.ts` — **существует, не меняется**; впервые
  получает вызывающего (middleware).
- Остальные ручки этой спеки готовы с 0037: `POST /api/auth/password-reset`,
  `POST /api/auth/password-reset/confirm`, `POST /api/auth/password`,
  `PATCH /api/auth/profile`.

### middleware (продление сессии)

`web/src/middleware.ts` (новый):

- matcher — все страницы, кроме `/_next/*`, статики и `/api/*` (иначе
  собственный вызов `/api/auth/refresh` из middleware рекурсивно попадёт в него
  же);
- логика: есть `hema_access` → `NextResponse.next()` без действий; нет
  `hema_access`, нет `hema_refresh` → тоже ничего (гость); нет `hema_access`,
  есть `hema_refresh` → один `fetch(new URL("/api/auth/refresh", req.nextUrl.origin))`
  с прокинутым заголовком `cookie`;
  - успех → `NextResponse.next()` + перенос `set-cookie` ответа ручки в ответ
    middleware (обновлённая пара токенов);
  - неуспех → `NextResponse.next()`, удаление `hema_refresh` и установка
    короткоживущей **не-httpOnly** cookie-метки `hema_session_expired=1`
    (её читает клиент, чтобы показать FR-15). Повторов нет: refresh-cookie
    удалена, следующая навигация идёт как гость (NFR-5);
- решение вынесено в чистую функцию `shared/lib/session-refresh.ts:
  refreshDecision({hasAccess, hasRefresh}) → "skip" | "guest" | "refresh"` —
  она и тестируется, middleware остаётся тонкой обёрткой над `fetch`.

### shared

- `shared/api/unauthorized.ts` (новый) — `class UnauthorizedError extends Error`
  и `ensureAuthorized(res: Response)`: бросает `UnauthorizedError` на 401.
  Используется фетчерами кабинета и подачи заявки (FR-18); сплошная миграция
  всех фич — вне скоупа (см. spec, «Вне скоупа»).
- `shared/lib/session-expired-store.ts` (новый, zustand, ADR 0006) —
  `{ isOpen, reason, open(), close() }`. Поднимается из двух источников:
  cookie-метки middleware (при монтировании) и глобального
  `QueryCache.onError` в `shared/lib/query-provider.tsx`, распознающего
  `UnauthorizedError`.
- `shared/config/site-config.ts` — пункт «О платформе» → «О турнире» (FR-49),
  `href: "/about"` не меняется.
- `shared/ui/*` — новых примитивов не заводим: диалоги (`dialog.tsx`), поля
  (`input`/`label`), `alert`, `tag`, `empty-state`, тосты (`sonner`) введены
  0022/0023. Нижний лист модалки на узком экране (FR-7) — набор классов на
  существующем `DialogContent`, не новый компонент.

### entities

- `entities/user/lib/password.ts` (новый, чистый) — `MIN_PASSWORD_LEN = 8` и
  `passwordHint(value) → { level: 0|1|2, ok: boolean, text: string }` (FR-6).
  Зеркалит `server/modules/auth/service/password_policy.go` и BFF-константу
  0037; комментарий об этом обязателен.
- `entities/fighter/lib/types.ts` — `+MyFighter` DTO:
  `{ id, name, club, status: FighterStatus, withdrawalReason, participations:
  { nominationId, status }[] }`.
- `entities/fighter/model/get-my-fighter.ts` (новый, `server-only`) — по
  образцу `entities/user/model/get-current-user.ts`: cookie → gRPC → DTO,
  `null` при отсутствии токена, ошибке или пустом ответе.
- `entities/tournament-live/lib/my-view.ts` (новый, чистый) — проекция «моего»
  из `TournamentLiveSnapshotDto` (FR-31..FR-36):
  - `myBouts(bouts, fighterId)` — бои, где я `fighterA` или `fighterB`;
  - `nextBout(bouts, fighterId)` — идущий мой бой, иначе первый не начатый (по
    `sequenceNumber` внутри своего пула); `null`, если нечего показать;
  - `boutsUntil(bouts, bout)` — сколько не начатых боёв того же пула стоит
    перед моим (FR-33, «через N боёв» — счёт боёв, не времени, FR-34);
  - `myNominationProgress(bouts, fighterId, nominationId)` →
    `{ containerName, done, total, wins, losses, draws } | null` — `null`,
    когда боёв ещё нет (FR-32).
- `entities/tournament/lib/format.ts` — `+formatEntryFee(minor, currency)`:
  `null` → `null` (плитка не рисуется, FR-44), `0` → «бесплатно», иначе сумма
  в основных единицах с символом валюты (конвертация из минорных уже есть в
  `lib/draft.ts` — выносится/переиспользуется, не копируется).

### features

- `features/auth/` — рестайл + расширение:
  - `model/auth-dialog-store.ts` — `mode: "login" | "register" | "reset"`,
    `returnTo?: string` (FR-16);
  - `api/requests.ts` — `+requestPasswordReset(email)`,
    `+resetPassword({token, password})`; `api/use-request-password-reset.ts`,
    `api/use-reset-password.ts` (RQ-мутации, как `use-login`);
  - `ui/auth-dialog.tsx` — три режима, рестайл, нижний лист на `sm:` (FR-2/FR-7);
  - `ui/auth-form.tsx` — состояние отправки (FR-4), ошибка у формы (FR-3),
    подписи регистрации (FR-5), подсказка пароля (FR-6);
  - `ui/password-hint.tsx` (новый) — визуализация `passwordHint`;
  - `ui/reset-request-form.tsx` (новый) — режим «Сброс пароля» (FR-8);
  - `ui/reset-password-form.tsx` (новый) — форма новой пары «пароль +
    подтверждение» для страницы по ссылке (FR-10..FR-12).
- `features/profile/` (новая фича) — «Изменить данные» и «Безопасность»:
  - `api/requests.ts` (`PATCH /api/auth/profile`, `POST /api/auth/password`,
    через `ensureAuthorized`), `api/use-update-profile.ts`,
    `api/use-change-password.ts`;
  - `ui/edit-profile-dialog.tsx` (FR-23), `ui/change-password-dialog.tsx`
    (FR-24/FR-25) — оба на `dialog.tsx`, ошибки — у полей, успех — тостом
    (правило 0023).
- `features/my-applications/model/apply-draft.ts` (новый, чистый + доступ к
  `localStorage` в try/catch) — `loadDraft(nominationId)`, `saveDraft`,
  `clearDraft`, `hasAnyDraft()` (FR-19..FR-21); подключается в
  `ui/apply-application-form.tsx` (сохранение при вводе, восстановление при
  монтировании, очистка после успешной подачи).

### widgets

- `widgets/dashboard/` (новый) — композиция кабинета (NFR-2):
  `dashboard-screen.tsx` (client, получает `user`, `myFighter`,
  `initialSnapshot` пропами), `next-bout-card.tsx` (FR-33/FR-36),
  `my-nominations.tsx` (FR-30..FR-32), `my-applications-preview.tsx`
  (FR-28/FR-29), `profile-card.tsx`, `security-card.tsx` (FR-22..FR-27),
  `dashboard-skeleton.tsx`. Живой канал — `useTournamentLive(initialSnapshot,
  enabled)`, где `enabled = Boolean(myFighter) && фаза турнира === идёт`
  (NFR-3).
- `widgets/reset-password/reset-password-screen.tsx` (новый) — экран страницы
  по ссылке из письма (FR-9..FR-13).
- `widgets/tournament-about/` (новый) — `tournament-about-screen.tsx`,
  `about-facts.tsx` (плитки когда/где/номинации/взнос, FR-43/FR-44),
  `about-regulations.tsx` (FR-45), `about-organizers.tsx` (контакты + главный
  судья, FR-46). Контакты рендерит существующий
  `widgets/home/venue-contacts.tsx`, если он подходит по виду; иначе блок
  организаторов собирает их сам — решается при реализации, дублирования
  `contactHref`/`contactLabel` быть не должно.
- `widgets/session-expired/session-expired-dialog.tsx` (новый) — FR-15..FR-17;
  монтируется в корневом `layout.tsx` рядом с `AuthDialog`. «Продолжить как
  гость» против «На главную» выбирается по текущему `pathname` (защищённые
  префиксы: `/dashboard`, `/applications`, `/nominations/*/apply`).
- `widgets/navbar/nav-links.tsx` — только текст пункта (из `site-config`),
  правок логики нет.

### app (роуты, server components)

- `app/dashboard/page.tsx` — остаётся серверной обёрткой (NFR-2):
  `getCurrentUser()` → `redirect("/login")` для гостя; `getMyFighter()`;
  `getTournamentLive()` **только если боец есть**; далее `<DashboardScreen … />`.
  Локальный `logout-button.tsx` переезжает в `widgets/dashboard`.
- `app/reset-password/page.tsx` (новый) — server-обёртка: читает `token` из
  `searchParams`, отдаёт в `<ResetPasswordScreen token={…} />`; пустой токен
  тоже отдаётся (экран сам показывает отказ, FR-13). Публичный роут, вне
  `(auth)`-группы: `(auth)/login|register` — deep-link-редиректы на модалку, а
  это самостоятельная страница.
- `app/about/page.tsx` — server-обёртка: `getActiveTournament()` +
  `getNominations()` → `<TournamentAboutScreen … />`; при `null`-турнире —
  сегодняшняя заглушка о платформе (FR-48).
- `app/layout.tsx` — `+<SessionExpiredDialog />`.

### Server components vs client

- Server: `dashboard/page.tsx`, `about/page.tsx`, `reset-password/page.tsx`,
  `navbar.tsx` (как сейчас) — всё, что читает cookie/gRPC.
- Client: диалоги (вход, профиль, пароль, истёкшая сессия), кабинет целиком
  (живая подписка), формы сброса, черновик заявки.

### State

- server-state → TanStack Query (мутации профиля/пароля/сброса; список заявок
  кабинета — существующий хук 0036);
- живой канал → локальный стрим-стейт `useTournamentLive` (ADR 0006 допускает
  для push);
- UI-state → zustand: `auth-dialog-store` (существует), `session-expired-store`
  (новый);
- черновик заявки → `localStorage` через `apply-draft.ts` (не zustand: должен
  переживать перезагрузку и вход).

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей).

- Издаёт: нет.
- Потребляет: нет. Живость кабинета — существующий in-process broadcaster
  (ADR 0012) через `WatchTournamentLive` (0034), новых подписчиков домена не
  появляется.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Юнит (Go, `service` с fake-репо)** — `service/my_fighter_test.go`:
  пустой `userID` → `ErrInvalidInput`; пустой `tournamentID` → резолв
  активного через fake-провайдер; боец найден → возвращается с участиями;
  бойца нет → `ErrNotFound`; провайдер активного турнира упал → `ErrNotFound`.
- **E2E ручек (Go, httptest + Connect)** — `api/me_handler_test.go`: без
  токена → `CodeUnauthenticated` (через интерсептор, как в тестах модуля
  auth); с токеном и бойцом → заполненный `Fighter` с участиями; с токеном
  без бойца → **успех с пустым `fighter`** (FR-41); чужой `tournament_id` не
  даёт чужого бойца (ключ поиска — всегда `CallerID`, а не поле запроса).
- **Интеграционные с БД** — не требуются: новых запросов и миграций нет,
  `FindByOrigin` покрыт тестами 0007.
- **Web (Vitest)**:
  - чистые функции: `my-view.test.ts` (ближайший бой при идущем/не начатом,
    «через N боёв», прогресс при отсутствии боёв, выведенный боец),
    `password.test.ts`, `apply-draft.test.ts` (сохранение/восстановление/
    очистка, недоступный `localStorage`), `session-refresh.test.ts`,
    `format.test.ts` (`formatEntryFee`: `null` / `0` / сумма);
  - BFF: `app/api/fighters/me/route.test.ts` (401 без cookie, `null` при
    пустом ответе, маппинг ошибок);
  - компоненты (RTL): `auth-dialog` (три режима, ошибка, состояние отправки),
    `reset-password-screen` (успех, битый токен, пустой токен),
    `dashboard-screen` (боец есть / бойца нет / боец выведен / заявок нет),
    `tournament-about-screen` (полный профиль / пустые поля / нулевой взнос /
    нет активного турнира), `session-expired-dialog` (действия на публичной и
    защищённой странице), `edit-profile-dialog` / `change-password-dialog`
    (отказ у поля, успех тостом).
- **Проверка целиком**: `make test-all`, `pnpm exec tsc --noEmit`,
  `go build ./...`, `pnpm build`.

## Риски и открытые вопросы

- **Middleware и cookie.** Перенос `set-cookie` из ответа внутреннего
  `fetch("/api/auth/refresh")` в ответ middleware — самое хрупкое место плана
  (формат заголовка, `Secure` в проде, edge-runtime). Если перенос окажется
  ненадёжным, запасной вариант — вынести обновление пары в саму middleware
  (вызов Connect-клиента невозможен на edge → `export const runtime = "nodejs"`
  для middleware либо отдельная внутренняя ручка, отдающая токены телом).
  Решается на T-шаге сессии, до кабинета.
- **Гонка продления.** Параллельные навигации могут одновременно вызвать
  `refresh`. Сервер сессии не хранит (0037, п. 6) — старый refresh-токен
  остаётся действительным до истечения, поэтому гонка безвредна; если позже
  появится ротация с инвалидацией, это место придётся защищать.
- **Объём ленты боёв.** `GetTournamentLive` отдаёт все бои всех готовых этапов
  турнира; кабинет фильтрует их на клиенте. На больших турнирах это тот же
  объём, что уже тянет публичная главная — новых лимитов не вводим, но если
  лента станет тяжёлой, серверная проекция «мой турнир» вернётся как отдельная
  задача (сознательно отклонённая в spec, решение 4).
- **`fighter_id` в публичной ленте.** Идентификаторы бойцов уже публичны с
  0034 (`FighterRef.fighter_id` в `WatchTournamentLive`), эта спека их
  публичность не расширяет — но опирается на неё; при будущем сокрытии id
  кабинет придётся переводить на серверную проекцию.
- **ADR 0016** должна быть написана до кода части «мои номинации»: она
  фиксирует разворот границы 0007, и без неё инкремент нарушает правило 5
  корневого `AGENTS.md`.

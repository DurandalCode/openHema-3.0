# Tasks: Вход, кабинет, о турнире

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-23
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

Волна 1 — четыре дизъюнктных по файлам куска: сервер (Go + BFF-ручка + entity
бойца), модалка входа/сброса, страница «О турнире», черновик заявки. Сессия
(волна 2) правит `auth-dialog-store`, который создаёт трек B, поэтому идёт
после него. Кабинет (волна 3) собирается из результатов A (боец), B (сессия) и
D (диалоги профиля живут в его же треке) — join-волна.

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 0     | —    | T1, T2 | `proto/hema/v1/fighter.proto`, `docs/adr/0016-*` | — |
| 1     | A    | T3–T7  | `server/modules/fighter/**`, `server/pkg/connectutil/auth_interceptor.go` (комментарий), `web/src/lib/grpc/{client,serialize}.ts`, `web/src/app/api/fighters/me/**`, `web/src/entities/fighter/**` | волна 0 |
| 1     | B    | T8–T11 | `web/src/features/auth/**`, `web/src/entities/user/lib/password.ts`, `web/src/widgets/reset-password/**`, `web/src/app/reset-password/**` | волна 0 |
| 1     | C    | T12–T13 | `web/src/widgets/tournament-about/**`, `web/src/app/about/**`, `web/src/shared/config/site-config.ts`, `web/src/entities/tournament/lib/format.ts` | волна 0 |
| 1     | D    | T14    | `web/src/features/my-applications/model/apply-draft.ts`, `web/src/features/my-applications/ui/apply-application-form.tsx` | волна 0 |
| 2     | E    | T15–T17 | `web/src/middleware.ts`, `web/src/shared/{lib/session-refresh.ts,lib/session-expired-store.ts,api/unauthorized.ts,lib/query-provider.tsx}`, `web/src/widgets/session-expired/**`, `web/src/app/layout.tsx` | трек B смержен |
| 3     | join | T18–T21 | `web/src/features/profile/**`, `web/src/entities/tournament-live/lib/my-view.ts`, `web/src/widgets/dashboard/**`, `web/src/app/dashboard/**` | треки A, B, E смержены |
| 4     | —    | T22–T26 | проверка, документация | всё выше |

## Контракты и решения

- [x] T1. `proto/hema/v1/fighter.proto` — `service FighterService` +
      `GetMyFighterRequest`/`GetMyFighterResponse` (см. `plan.md`,
      «Контракты»); `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_
- [x] T2. `docs/adr/0016-account-fighter-self-link.md` — ADR о развороте
      границы 0007: контекст (0007 отвязала, 0026/0034/0037 не восстанавливали),
      решение (чтение своего бойца владельцем), границы (только владелец,
      только чтение, только активный турнир, админка не меняется, снапшот и
      профиль независимы), последствия, альтернативы. Ссылка на эту спеку.

## Server (трек A)

- [x] T3. **service (red→green)** — `modules/fighter/service/my_fighter_test.go`:
      пустой `userID` → `ErrInvalidInput`; пустой `tournamentID` → резолв через
      fake `ActiveTournamentProvider`; найденный боец с участиями; `ErrNotFound`
      при отсутствии; падение провайдера → `ErrNotFound` → затем
      `service/my_fighter.go`.
- [x] T4. **api (red→green)** — `modules/fighter/api/me_handler_test.go`
      (httptest + Connect, fake-репо): с токеном и бойцом → заполненный
      `Fighter`; с токеном без бойца → успех с пустым `fighter` (FR-41); без
      токена → `CodeUnauthenticated`; чужой `tournament_id` не отдаёт чужого
      бойца → затем `api/me_handler.go`.
- [x] T5. **wiring** — `modules/fighter/module.go`: регистрация
      `NewFighterServiceHandler` с `baseOpts`; в `publicProcedures`
      (`server/pkg/connectutil/auth_interceptor.go`) RPC **не** добавляется —
      только комментарий рядом, почему (default-deny).
- [x] T6. **BFF (red→green)** — `web/src/app/api/fighters/me/route.test.ts`
      (mock gRPC): 401 без cookie, `{fighter: null}` при пустом ответе, маппинг
      ошибок → затем `route.ts`; `lib/grpc/client.ts` (+`fighterClient`),
      `lib/grpc/serialize.ts` (переиспользовать существующую сериализацию
      `Fighter`, не дублировать).
- [x] T7. **entity** — `entities/fighter/lib/types.ts` (`MyFighter`) +
      `entities/fighter/model/get-my-fighter.ts` (server-only, по образцу
      `get-current-user.ts`) + тест на `null` при отсутствии токена/ошибке.

## Вход, сброс пароля (трек B)

- [x] T8. **чистая функция (red→green)** — `entities/user/lib/password.test.ts`
      → `password.ts`: `MIN_PASSWORD_LEN`, `passwordHint` (уровни, `ok`, текст).
- [x] T9. **запросы и мутации (red→green)** — `features/auth/api/requests.test.ts`
      (+`requestPasswordReset`, `resetPassword`) → `requests.ts`,
      `use-request-password-reset.ts`, `use-reset-password.ts`;
      `model/auth-dialog-store.ts` — режим `reset` + `returnTo` (тест стора).
- [x] T10. **модалка (red→green)** — RTL-тесты `auth-dialog`/`auth-form`:
      переключение табов и режима «Забыли пароль?» ↔ «Вернуться ко входу»,
      состояние отправки, отказ с сохранением введённого email, блокировка
      отправки регистрации при коротком пароле → затем рестайл
      `auth-dialog.tsx`/`auth-form.tsx`, новые `password-hint.tsx`,
      `reset-request-form.tsx`.
- [x] T11. **страница по ссылке (red→green)** —
      `widgets/reset-password/reset-password-screen.test.tsx`: успех (без
      сессии, предложение войти), битый/использованный токен (единый отказ),
      пустой токен (форма не показывается), несовпадение подтверждения →
      затем `reset-password-screen.tsx`,
      `features/auth/ui/reset-password-form.tsx`, `app/reset-password/page.tsx`.

## О турнире (трек C)

- [ ] T12. **формат (red→green)** — `entities/tournament/lib/format.test.ts`:
      `formatEntryFee` (`null` → `null`, `0` → «бесплатно», сумма с валютой) →
      затем `format.ts` (конвертацию минорных единиц переиспользовать из
      `lib/draft.ts`, не копировать).
- [ ] T13. **экран (red→green)** —
      `widgets/tournament-about/tournament-about-screen.test.tsx`: полный
      профиль (место, взнос, регламент, судья, контакты), незаполненные поля не
      рендерятся, нулевой взнос, отсутствие активного турнира (текст о
      платформе), CTA подачи только при открытом приёме → затем компоненты
      виджета, `app/about/page.tsx`, переименование пункта навигации в
      `shared/config/site-config.ts` (+ правка существующего теста навигации).

## Черновик заявки (трек D)

- [ ] T14. **черновик (red→green)** —
      `features/my-applications/model/apply-draft.test.ts`: сохранение и
      восстановление по номинации, изоляция между номинациями, очистка после
      подачи, недоступный `localStorage` не ломает форму → затем
      `apply-draft.ts` и подключение в `apply-application-form.tsx` (+ тест
      формы: восстановленный текст при монтировании, очистка после успеха).

## Сессия (трек E, после B)

- [ ] T15. **решение о продлении (red→green)** —
      `shared/lib/session-refresh.test.ts` (`refreshDecision`: есть access →
      `skip`, нет обоих → `guest`, только refresh → `refresh`) → затем
      `session-refresh.ts` и `web/src/middleware.ts` (перенос `set-cookie`,
      удаление `hema_refresh` и метка `hema_session_expired` при неудаче).
- [ ] T16. **перехват 401 (red→green)** — `shared/api/unauthorized.test.ts`
      (`ensureAuthorized` бросает `UnauthorizedError` на 401) → затем
      `unauthorized.ts`, `shared/lib/session-expired-store.ts` и подключение
      `QueryCache.onError` в `shared/lib/query-provider.tsx`.
- [ ] T17. **диалог (red→green)** —
      `widgets/session-expired/session-expired-dialog.test.tsx`: поднимается по
      cookie-метке и по `UnauthorizedError`; на публичной странице —
      «Продолжить как гость», на защищённой — «На главную»; «Войти снова»
      открывает вход и запоминает `returnTo`; упоминание черновика только когда
      он есть → затем компонент + монтирование в `app/layout.tsx`.

## Кабинет (join-волна)

- [ ] T18. **проекция «моего» (red→green)** —
      `entities/tournament-live/lib/my-view.test.ts`: `myBouts`, `nextBout`
      (идущий приоритетнее не начатого), `boutsUntil`, `myNominationProgress`
      (`null` без боёв, победы/поражения, имя контейнера) → затем `my-view.ts`.
- [ ] T19. **профиль и пароль (red→green)** — тесты
      `features/profile/api/requests.test.ts` и RTL-тесты
      `edit-profile-dialog`/`change-password-dialog`: пустое имя отклонено,
      неверный текущий пароль — отказ у поля, успех — тост с предупреждением о
      других устройствах → затем `features/profile/**`.
- [ ] T20. **экран кабинета (red→green)** —
      `widgets/dashboard/dashboard-screen.test.tsx`: боец есть (номинации,
      ближайший бой, «через N боёв», живое обновление счёта), бойца нет (блоков
      нет, подсказка про заявку), боец выведен (плашка, боя нет), заявок нет
      (приглашение), подписка не открывается вне идущего турнира → затем
      компоненты `widgets/dashboard/**`.
- [ ] T21. **роут** — `app/dashboard/page.tsx` как server-обёртка: гость →
      `redirect("/login")`, `getMyFighter`, `getTournamentLive` только при
      наличии бойца; `logout-button.tsx` переезжает в виджет.

## Проверка

- [ ] T22. `make test-all` зелёный.
- [ ] T23. `pnpm exec tsc --noEmit`.
- [ ] T24. `go build ./...` + `pnpm build`.
- [ ] T25. Ручная проверка сквозного сценария на `make dev`: истечение access
      (подождать/срезать TTL) → продление без выхода; смена пароля → старая
      вкладка получает «Сессия истекла»; письмо восстановления из журнала
      сервера → `/reset-password?token=…` → вход новым паролем.
- [ ] T26. Обновить статусы спеки/плана, строку `0038` в
      `docs/specs/README.md` (резерв → done) и строку экрана «Вход, кабинет, о
      платформе» в `docs/design-sync.md` (реальные repo-пути, как требует её
      раздел «Как поддерживать в актуальном состоянии»); отметить в ADR 0015,
      что порядок пройден полностью.

# Plan: Редизайн публичной стороны заявок — подача и «Мои заявки»

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: draft
- Дата: 2026-08-22
- Спека: `./spec.md`

## Обзор решения

Инкремент чисто клиентский: `/proto` и Go-сервер не меняются (NFR-1), все
данные едут существующими RPC модуля `application` (0005/0006) и публичным
справочником номинаций (0003). Работа делится на три части:

1. **Новый роут подачи** `app/nominations/[id]/apply/` — тонкая серверная
   обёртка (сессия → номинация → турнир) + виджет-композиция
   `widgets/application-apply/`; форма подачи переезжает из
   `features/my-applications/ui/submit-application-button.tsx` (удаляется) в
   контролируемый `apply-application-form.tsx` с тостами и человеческими
   отказами.
2. **Редизайн «Моих заявок»** — `app/applications/page.tsx` сужается до
   серверной обёртки (приём 0032), композиция переезжает в
   `widgets/my-applications/`, карточка заявки с действиями — в
   `features/my-applications/ui/application-card.tsx`; чистые функции тона
   состояния и воронки добавляются в `entities/application/lib/state.ts`.
3. **Точки входа** — блок подачи на публичной странице номинации (0035) и
   кнопка вместо инлайн-формы на карточке главной (0034).

Единственная правка вне UI — **BFF `POST /api/applications`** учится
различать два отказа, которые `errorResponse` схлопывает в один 409
(`AlreadyExists` — активный дубль, `FailedPrecondition` — приём закрыт), и
отдаёт по ним разный русский текст (приём 0027: BFF-строки — наш код, в
отличие от волатильных сообщений Go-домена). Контракт `/proto` при этом не
меняется.

## Контракты (proto)

**Не меняются.** Сверка макета с `proto/hema/v1/application.proto` и
`nomination.proto` показала, что всё нужное уже есть:

- `ApplicationService.SubmitApplication(nomination_id, club, needs_equipment)`
  — ровно два поля формы 14a (0006);
- `ApplicationService.ListMyApplications` → `repeated Application` с
  `state`, `club`, `needs_equipment`, `nomination_id`, датами;
- `ApplicationService.DeclarePayment` / `WithdrawApplication` — действия
  заявителя;
- `NominationService.ListNominations` / `GetNomination` (публичные, без
  токена) — источник названия номинации и статуса приёма (0012).

Новых полей (в т.ч. `Application.nomination_title`) не вводим — название
join'ится на чтении, см. «Принятые решения» спеки, п.4.

## Server (модули и слои)

**Не меняется.** Ни новых RPC, ни миграций, ни правок домена
`modules/application`. Клиентский гейт действий (`allowedApplicantActions`)
остаётся зеркалом доменной машины состояний; окончательное решение — за
`domain.Application.DeclarePayment/Withdraw` (spec NFR-4, уже так).

## Web (FSD + BFF)

### BFF (Route Handlers, Node runtime)

- `app/api/applications/route.ts` — **POST**: перед общим `errorResponse`
  разбирается `ConnectError`:
  - `Code.AlreadyExists` → 409 `{"error":"Вы уже подали заявку в эту
    номинацию"}`;
  - `Code.FailedPrecondition` → 409 `{"error":"Приём заявок в эту номинацию
    завершён"}`;
  - `Code.NotFound` → 404 `{"error":"Номинация не найдена"}`;
  - остальное — как сейчас, через `errorResponse`.
  GET и прочие ручки заявок не трогаются.
- Новых маршрутов нет: список — существующий `GET /api/applications`,
  действия — `POST /api/applications/[id]/{declare-payment,withdraw}`.

### entities

- `entities/application/lib/state.ts` (+ тесты в существующем `state.test.ts`):
  - `stateTone(state): "success" | "warning" | "neutral" | "muted"` —
    тональность плашки (FR-16), единый источник для карточки и будущих
    экранов;
  - `applicationFunnel(): { label: string }[]` — упорядоченная воронка
    состояний для блока «Что дальше» (FR-4), собранная из существующего
    `stateLabel`, чтобы подписи не разъезжались со списком заявок.
  - существующие `stateLabel` / `allowedApplicantActions` / `isTerminal` /
    `nextExpectedStep` (0025) переиспользуются как есть.
- `entities/nomination/model/get-nominations.ts`, `get-nomination.ts` —
  используются как есть (server-only, публичный gRPC без токена).

### features/my-applications

- `api/requests.ts` — тип отказа расширяется статусом:
  `{ ok: false; error: string; status?: number }` (аддитивно, как в
  `nomination-pools`); `post()`/`listMyApplicationsRequest()` прокидывают
  `res.status`.
- `api/errors.ts` (новый, + тест) — `applicationErrorMessage(error, status)`:
  409 → текст из BFF как есть (он уже человеческий, см. выше), 401/403 →
  «Войдите, чтобы продолжить», 404 → «Номинация не найдена», сеть/прочее →
  «Не удалось выполнить действие, попробуйте ещё раз». Тот же приём, что
  `poolsErrorMessage` (0030) / `presetErrorMessage` (0029).
- `api/use-submit-application.ts`, `use-declare-payment.ts`,
  `use-withdraw-application.ts` — остаются «тупыми» мутациями с
  инвалидацией `myApplicationsKeys.list()`; тосты зовёт UI (правило
  `web/AGENTS.md`: единственный вход — `shared/lib/toast.ts`).
- `ui/apply-application-form.tsx` (новый, + тест) — контролируемая форма
  подачи: `Input` (клуб, подпись «— опционально»), `Checkbox` (экипировка),
  кнопка с `loading`; успех → `toastSuccess("Заявка подана")` +
  `router.push("/applications")` (FR-5), отказ →
  `toastError(applicationErrorMessage(...), { retry })` (FR-6), значения
  полей сохраняются.
- `ui/application-card.tsx` (новый, + тест) — карточка «Моих заявок»
  (FR-15..FR-23): название номинации, `Badge tone={stateTone(...)}`,
  `nextExpectedStep` подписью, `Tag` «нужна экипировка», клуб, действия по
  `allowedApplicantActions`; «Отозвать» открывает `ConfirmDialog`
  (`destructive`, без `confirmWord` — потеря не разрушительна для системы,
  но необратима для заявки), «Я оплатил» — сразу мутация + тост.
- `ui/nomination-apply-cta.tsx` (новый, + тест) — блок подачи для страницы
  номинации (FR-10..FR-12): при закрытом приёме — подпись «Приём заявок
  завершён»; иначе смотрит `useMyApplications()` и показывает либо
  состояние активной заявки + ссылку «Мои заявки» (FR-11), либо кнопку-ссылку
  на `/nominations/[id]/apply`.
- `ui/submit-application-button.tsx`, `ui/my-applications-list.tsx` —
  **удаляются** (композиция уезжает в виджеты, правило 0032 NFR-2).

### widgets

- `widgets/application-apply/apply-screen.tsx` (новый, + тест) — экран 14a:
  ссылка «← <название номинации>», заголовок «Заявка на участие», подпись
  «<турнир> · <номинация>», три взаимоисключающие ветки — форма (FR-3/FR-4),
  «приём завершён» (FR-7), «заявка уже подана» (FR-8).
- `widgets/application-apply/apply-what-next.tsx` (новый, + тест) — блок
  «Что дальше» поверх `applicationFunnel()` + правило отзыва.
- `widgets/my-applications/my-applications-screen.tsx` (новый, + тест) —
  экран 15a: `PageHeader`-подобная шапка («Мои заявки» + подпись), список
  карточек, скелетон в форме карточек (FR-24), `StatusPage`/оформленная
  ошибка загрузки с повтором (FR-24), `EmptyState` со ссылкой на `/#nominations`
  (FR-25). Название номинации берёт из карты `Record<nominationId, title>`,
  пришедшей пропом с сервера; отсутствующий ключ — карточка без названия
  (FR-26).
- `widgets/my-applications/my-applications-skeleton.tsx` (новый) — скелетон
  «в форме будущего контента» (0023).
- `widgets/nomination-public/nomination-public-screen.tsx` — принимает
  `isAuthenticated: boolean` и рендерит `NominationApplyCta` под шапкой.
- `widgets/nominations-list/nominations-list.tsx` — инлайн-форма заменяется
  кнопкой-ссылкой на экран подачи (FR-13); импорт
  `SubmitApplicationButton` уходит.

### app (роуты, server components)

- `app/nominations/[id]/apply/page.tsx` (новый) — `getCurrentUser()` → нет
  сессии → `redirect("/login")` (FR-1); `getNomination(id)` → `null` →
  `notFound()` (FR-9); `getActiveTournament()` для подписи; рендерит
  `ApplyScreen`.
- `app/applications/page.tsx` — остаётся защищённым (`redirect("/login")`),
  сужается до обёртки: `getActiveTournament()` + `getNominations(t.id)` →
  карта названий → `MyApplicationsScreen`.
- `app/nominations/[id]/page.tsx` — добавляется `getCurrentUser()` и проброс
  `isAuthenticated` в `NominationPublicScreen`.

### Server components vs client

- Серверные: обе страницы-обёртки (сессия, публичные gRPC-чтения, карта
  названий) — токен в клиент не утекает (существующий приём 0007/0035).
- Клиентские: формы, карточки, CTA, экраны с `useQuery`/мутациями.

### State

- server-state — TanStack Query (`myApplicationsKeys.list()`, существующий
  ключ; инвалидация после каждой мутации);
- UI-state — `useState` в форме и в открытии `ConfirmDialog`; Zustand не
  нужен;
- Названия номинаций — **не** query, а SSR-проп (справочник меняется редко,
  лишний клиентский запрос не нужен).

## События

Placeholder: фича доменных событий не издаёт и не потребляет. Существующий
event-sourced журнал заявки (0005, ADR 0011) читается только админской
стороной (0025) — сюда не выносится (см. «Вне скоупа» спеки).

## Тестирование

Только web (Vitest + Testing Library), по пирамиде ADR 0003 — серверных
изменений нет.

- **Юнит (чистые функции):**
  - `entities/application/lib/state.test.ts` — `stateTone` на все пять
    состояний + `UNSPECIFIED`; `applicationFunnel` — порядок и совпадение
    подписей со `stateLabel`.
  - `features/my-applications/api/errors.test.ts` — маппинг статусов.
- **Компонентные:**
  - `apply-application-form.test.tsx` — поля контролируемы; успех →
    `toastSuccess` + переход; отказ → `toastError` с текстом от
    `applicationErrorMessage`, поля не очищены (AC-3/AC-6).
  - `apply-screen.test.tsx` — три ветки: форма / «приём завершён» /
    «уже подана» (AC-1/AC-4/AC-5).
  - `apply-what-next.test.tsx` — четыре шага воронки в порядке.
  - `application-card.test.tsx` — набор действий по состоянию (AC-8/AC-9),
    тон плашки, приглушение терминальной, `nextExpectedStep` только у
    нетерминальной, отзыв только после подтверждения (AC-10), «Я оплатил»
    без диалога (AC-11), клуб/экипировка скрыты при пустых значениях.
  - `my-applications-screen.test.tsx` — скелетон при загрузке, ошибка с
    повтором (AC-12), пустое состояние (AC-13), название из карты и карточка
    без названия при промахе (AC-7/FR-26).
  - `nomination-apply-cta.test.tsx` — гость (ничего не рендерится), открытый
    приём без заявки (кнопка), с активной заявкой (состояние + ссылка),
    закрытый приём (подпись) — AC-2/AC-5, FR-10..FR-14.
- **BFF (e2e ручки):** `app/api/applications/route.test.ts` — три новых
  ветки маппинга `ConnectError` (AlreadyExists / FailedPrecondition /
  NotFound) поверх существующих тестов.
- **Ручной смоук:** реальный BFF + сервер + Postgres (headless-браузера в
  среде реализации нет — как в 0026/0027/0030–0035): подача заявки, отказ
  «дубль», отказ «приём закрыт», отметка оплаты, отзыв, обновление списка.

## Риски и открытые вопросы

- **Заявки вне активного турнира.** Карта названий строится по номинациям
  активного турнира; заявка из архивного турнира названия не получит
  (FR-26 — карточка без названия). Осознанный размен: альтернатива —
  `GetNomination` по каждой заявке (N запросов) или новое поле в контракте
  (нарушает NFR-1). Система де-факто однотурнирная (0001), риск низкий.
- **Два отказа под одним 409.** Различение живёт в BFF по `connect.Code`;
  если модуль `application` когда-нибудь начнёт отдавать `FailedPrecondition`
  ещё по какой-то причине для `SubmitApplication`, текст «приём завершён»
  станет неточным. Проверяется тестом ручки и фиксируется комментарием в
  маршруте.
- **`useMyApplications` на публичной странице номинации.** CTA для вошедшего
  делает лишний запрос своих заявок на странице номинации. Приемлемо:
  запрос маленький, кэш общий с `/applications`, гостю не отправляется
  вовсе (компонент не рендерится).
- **Переход после подачи на `/applications`** (FR-5) — решение этой спеки,
  макет молчит. Если при смоуке окажется, что боец ждёт возврата в
  номинацию, менять один вызов `router.push`.

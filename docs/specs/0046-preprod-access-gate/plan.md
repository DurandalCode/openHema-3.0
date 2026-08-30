# Plan: Режим препродакшена (гейт публичного доступа)

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: draft
- Дата: 2026-08-30
- Спека: `./spec.md`

## Обзор решения

Чисто web-фича (решение пользователя: гейт закрывает только веб/BFF-слой,
Go gRPC-сервер и `publicProcedures` не трогаем — `/proto` не меняется, новых
RPC нет). Два независимых boolean-флага конфигурации Next.js-процесса,
`PREPROD_MODE` и `REGISTRATION_DISABLED`, читаются двумя серверными pure-
функциями и применяются в двух точках: (1) на трёх публичных страницах —
`redirect("/login")` (готовый приём `app/(admin)/layout.tsx`) на двух из
трёх, гейт-экран на месте на главной (см. ниже, почему не единообразно);
(2) в 13 публичных BFF-ручках — ранний `401`, если `PREPROD_MODE` включён и
валидной сессии нет.

**Важная находка по существующей архитектуре**, меняющая буквальное
прочтение UX-решения «редирект на /login»: `/login` и `/register` —
не отдельные страницы с контентом, а `"use client"` deep-link-заглушки
(`app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`), которые сразу
открывают глобальный `AuthDialog` (смонтирован в `app/layout.tsx`, zustand-
стор `useAuthDialogStore`) и делают `router.replace("/")`. Жёсткий HTTP-
редирект гостя с `/` на `/login` зациклился бы: `/login` тут же заменяет URL
обратно на `/`, а `/`, продолжая считать гостя гостем, снова отправила бы
его на `/login`. Поэтому «редирект на /login» реализуется **на месте**, без
навигации: гейтуемая страница сама рендерит экран-приглашение и открывает
тот же `AuthDialog` в режиме `"login"` — ровно то состояние, в которое
`/login` и так переводит пользователя. Снаружи для пользователя разницы нет
(тот же диалог поверх того же адреса), а цикла редиректов не возникает.
Критерии приёмки (`spec.md`) на это не завязаны — сформулированы как
«видит приглашение войти», а не «браузер получает 3xx».

## Контракты (proto)

Не меняются. Все RPC, чьи данные гейтятся, уже существуют и уже публичны на
уровне сервера (`server/pkg/connectutil/auth_interceptor.go`,
`publicProcedures`) — решение пользователя оставляет эту поверхность как
есть и закрывает её только на BFF.

## Server (модули и слои)

Не меняются. Явное решение пользователя: гейт — только web/BFF-уровень.
Прямой вызов gRPC-сервера в обход BFF (кто-то, кто знает адрес сервера)
публичные RPC отдаёт как сегодня — зафиксировано в spec.md, «Вне скоупа».

## Web (FSD + BFF)

### Конфигурация

- `.env.example` — добавить `PREPROD_MODE=` и `REGISTRATION_DISABLED=`
  (пустая строка — легальная конфигурация, оба выключены по умолчанию, тот
  же приём, что `FILE_STORAGE_DIR`).
- `shared/config/preprod.ts` (новый, server-only) — `isPreprodModeEnabled()`
  и `isRegistrationDisabled()`: `process.env.PREPROD_MODE === "true"` /
  `process.env.REGISTRATION_DISABLED === "true"`. Чистые функции без
  состояния, как остальные `shared/config/*`.

### Гейт публичных страниц

**Найден готовый прецедент того же гейта** — `app/(admin)/layout.tsx`
(спека 0023) уже разделяет гостя и юзера ровно так, как нужно здесь:

```tsx
const user = await getCurrentUser();
if (!user) {
  redirect("/login");
}
```

Этот `redirect("/login")` безопасно переиспользовать буквально для
**`/about`** и **`/nominations/[id]`**: `/login` — клиентская заглушка,
которая открывает `AuthDialog` и тут же делает `router.replace("/")` — с
этих двух страниц уход на `/login` и обратно на `/` цикла не создаёт,
потому что сам `/` — не они.

**Для `/` этот же приём зациклился бы**: `/login` заменяет URL обратно на
`/`, а если `/` при госте снова делает `redirect("/login")` — новый цикл.
Поэтому только для главной — отдельный путь: не редиректить, а рендерить
гейт **на месте**. Новый виджет `widgets/preprod-gate/preprod-gate-screen.tsx`
(плоско, без `ui/`-подпапки — как остальные виджеты, напр.
`widgets/session-expired/session-expired-dialog.tsx`; `"use client"`) — минимальный экран-приглашение («Сайт закрыт до
запуска — войдите, чтобы продолжить»); на монтировании безусловно зовёт
`useAuthDialogStore.getState().open("login")`. После успешного входа
`AuthDialog.onSuccess()` уже делает `router.refresh()` — главная
перерендерится с сессией и покажет реальный контент, без навигации.

Итого:
- `app/page.tsx` — `currentUser` уже вычисляется (`getCurrentUser()`);
  добавить ветвление `isPreprodModeEnabled() && !currentUser` →
  `<PreprodGateScreen />` вместо обычного виджета (не `redirect`).
- `app/nominations/[id]/page.tsx` — `getCurrentUser()` уже вызван; добавить
  `if (isPreprodModeEnabled() && !currentUser) redirect("/login");` —
  дословно приём `app/(admin)/layout.tsx`.
- `app/about/page.tsx` — сейчас `getCurrentUser()` не вызывает; добавить
  вызов и тот же `redirect("/login")`, что на странице номинации.
- `/login`, `/reset-password`, `/verify-email`, `/email-change/confirm` —
  без изменений, остаются доступны (FR-3): не входят в набор гейтуемых
  публичных страниц.

### Пауза регистрации (независимо от гейта)

- `app/layout.tsx` — вычислить `isRegistrationDisabled()` (server component)
  и передать пропом в `<AuthDialog registrationDisabled={...} />`.
- `features/auth/ui/auth-dialog.tsx` — при `registrationDisabled` таб
  «Регистрация» рендерит сообщение «Регистрация временно закрыта» вместо
  `<AuthForm mode="register">` (AC-7). Так же — на прямом заходе на
  `/register` при выключенном `PREPROD_MODE` (сайт публично виден, паузa
  только на регистрацию): `AuthDialog` откроется в режиме `"register"`
  (заглушка `/register` его не знает про флаг), но покажет то же
  сообщение — контент таба решает, а не режим открытия.

### Гейт публичных BFF-ручек

- `lib/grpc/preprod-guard.ts` (новый) — `assertPreprodAccess(): Promise<NextResponse | null>`:
  если `isPreprodModeEnabled()` и `!(await getCurrentUser())` → возвращает
  `NextResponse.json({ error: "preproduction: access requires an account" },
  { status: 401 })`; иначе `null` (продолжать как обычно). Переиспользует
  тот же `getCurrentUser()`, что уже дважды оплачен на страницах — лишний
  RPC `AuthService.Me` на негейтованный трафик не появляется (флаг
  выключен по умолчанию, FR-6).
- Применяется первой строкой в каждом из 13 публичных `GET`-хендлеров
  (`const gate = await assertPreprodAccess(); if (gate) return gate;`):
  - `app/api/tournament/route.ts`
  - `app/api/tournament/live/route.ts`
  - `app/api/tournament/live-snapshot/route.ts`
  - `app/api/nominations/route.ts`
  - `app/api/nominations/[id]/route.ts`
  - `app/api/nominations/[id]/participants/route.ts`
  - `app/api/nominations/[id]/roster/route.ts`
  - `app/api/nominations/[id]/public-pools/route.ts`
  - `app/api/nominations/[id]/live/route.ts`
  - `app/api/nominations/[id]/live-snapshot/route.ts`
  - `app/api/nominations/[id]/results/route.ts`
  - `app/api/nominations/[id]/results/export/route.ts`
  - `app/api/files/[id]/route.ts`
- `app/api/auth/register/route.ts` — первой строкой:
  `if (isRegistrationDisabled() || isPreprodModeEnabled()) return
  NextResponse.json({ error: "registration is currently closed" }, { status:
  403 })`, до вызова `authClient.register`. Закрывает и FR-4 (регистрация не
  входит в исключения гейта), и FR-7/FR-8 (отдельная пауза) одним условием.
- `app/api/auth/login`, `.../refresh`, `.../password-reset`,
  `.../password-reset/confirm`, `.../email/verify`,
  `.../email/change/confirm` — без изменений, не гейтуются (FR-3; ровно те
  же RPC, что в серверном `publicProcedures`, за вычетом `Register`).

### Слои

- `shared/config/preprod.ts` — конфигурация (см. выше).
- `widgets/preprod-gate/preprod-gate-screen.tsx` — композиция экрана.
- `lib/grpc/preprod-guard.ts` — BFF-инфраструктура (не импортируется в
  клиентские компоненты, как остальной `lib/`).
- Правки существующих `app/**/page.tsx`, `app/api/**/route.ts`,
  `app/layout.tsx`, `features/auth/ui/auth-dialog.tsx` — точечные, без новых
  сущностей/фич в `entities`/`features`.

### Server components vs client

`PreprodGateScreen` — client (нужен `useAuthDialogStore`, `useEffect` на
монтирование). Остальное — без изменений относительно текущего (страницы —
server components, `AuthDialog`/`AuthForm` — уже client).

### State

Флаги читаются на сервере (`process.env`) и нигде не всплывают как client-
state — `registrationDisabled` в `AuthDialog` приходит пропом сверху
(server → client, одноразово при рендере layout), не через store/query.
`useAuthDialogStore` (существующий) используется как есть, без новых полей.

## События

Placeholder — фича не издаёт и не потребляет доменных событий.

- Издаёт: нет
- Потребляет: нет

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл). Фича — чистый web, без
> Go/интеграционных тестов.

- **Vitest, `shared/config/preprod.test.ts`** — `isPreprodModeEnabled`/
  `isRegistrationDisabled` на пустом/`"true"`/любом другом значении env.
- **Vitest, `lib/grpc/preprod-guard.test.ts`** — `assertPreprodAccess()`:
  флаг выключен → `null` без вызова `getCurrentUser` (мок); флаг включён +
  нет сессии → `401`; флаг включён + есть сессия (мок `getCurrentUser`) →
  `null`.
- **Vitest, по одному представителю на паттерн** (не дублировать 13 раз
  одинаковую проверку): `app/api/tournament/route.test.ts` — расширить
  существующий кейсами `PREPROD_MODE=true` без сессии → `401`, с сессией →
  как раньше; `app/api/files/[id]/route.test.ts` — аналогично. Остальные 11
  ручек — по одному тонкому regression-кейсу «guard вызывается первой
  строкой» (мок `assertPreprodAccess`), не полный happy-path заново.
- **Vitest, `app/api/auth/register/route.test.ts`** — расширить: любой из
  флагов включён → `403`, `authClient.register` не вызван.
- **Vitest, `widgets/preprod-gate/preprod-gate-screen.test.tsx`** — рендер
  вызывает `useAuthDialogStore.open("login", ...)`.
- **Vitest, `features/auth/ui/auth-dialog.test.tsx`** — расширить:
  `registrationDisabled=true` → таб «Регистрация» без `AuthForm`, с текстом
  сообщения.
- **Ручная проверка (T-финал)**: `make dev` с `PREPROD_MODE=true` в
  `.env` — гость на `/`, `/about`, `/nominations/[id]` видит гейт-экран и
  диалог входа; логин снимает гейт без навигации; `/login` не зацикливается;
  `curl /api/tournament` без cookie — `401`. Отдельно `REGISTRATION_DISABLED=true`
  (без `PREPROD_MODE`) — сайт виден, `/register` показывает сообщение,
  `curl -X POST /api/auth/register` — `403`.

## Риски и открытые вопросы

- **Косметика `/register`-заглушки при включённом только
  `REGISTRATION_DISABLED`**: `AuthDialog` откроется в табе «Регистрация» и
  сразу покажет сообщение о паузе (не форму) — это уже корректно по AC-7 и
  не требует правки самой заглушки `app/(auth)/register/page.tsx`.
- **`getCurrentUser()` в `assertPreprodAccess` — лишний RPC на гейтованный
  публичный трафик.** Приемлемо: вызывается только пока `PREPROD_MODE`
  включён (по определению — сайт ещё не запущен, трафика немного, см.
  `docs/deployment.md`); при выключенном флаге (по умолчанию) — ноль
  дополнительных вызовов.
- Если позже понадобится admin UI для флагов «на лету» (сейчас — вне
  скоупа, только env) — это будет отдельная спека поверх этой же пары
  функций `shared/config/preprod.ts`, без переписывания гейтов.

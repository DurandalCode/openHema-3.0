# ADR 0005: UI-архитектура — FSD-aligned App Router + shadcn/ui

- Статус: принято
- Дата: 2026-07-06

## Контекст

Клиент `/web` (Next.js 15 App Router, React 19) до этого инкремента представлял
собой каркас: 5 маршрутов, 2 клиентских компонента, **стилей нет вообще** — всё
inline `style={{}}` с захардкоженными цветами. `src/components/` не существует,
компоненты co-located с роутами. Логика получения текущего пользователя
дублировалась в `dashboard/page.tsx` и `api/auth/me/route.ts`.

Текущий инкремент вводит целевой UI: shadcn/ui, тёмная+светлая темы, навбар с
адаптивным auth-блоком (модалка входа/регистрации из меню), фундамент лендинга.
Одновременно нужно зафиксировать **подход к организации UI-кода**, чтобы
проект мог расти без превращения в «плоское» нагромождение компонентов и
оставался навигабельным для AI-агентов (проект AI-first).

## Решение

### 1. FSD-aligned App Router

Next.js App Router остаётся **маршрутизатором**: `src/app/**` определяет роуты,
layouts, metadata, route handlers (BFF). Поверх App Router накладываются слои
Feature-Sliced Design для **переиспользуемого** кода — того, что не привязан
к конкретному роуту:

```
src/
  app/                     роуты (App Router), layouts, metadata, BFF route handlers
    (auth)/login,register  thin-страницы: deep-link stubs, открывают модалку
    dashboard/             защищённый кабинет
    api/auth/**            BFF (Node runtime, без изменений)
    layout.tsx             root layout: ThemeProvider + Navbar + AuthDialogProvider
    page.tsx               лендинг (server component)
    globals.css            Tailwind v4 entry + CSS-переменные темы
  shared/                  переиспользуемое БЕЗ бизнес-смысла
    ui/                    shadcn-компоненты (владеем, можем править)
    lib/                   cn.ts и пр. утилиты без бизнес-логики
    hooks/                 общие хуки (позже)
    config/                site-config (название, пункты навигации)
  entities/                бизнес-сущности: модель + UI
    user/
      model/               getCurrentUser() — server-only (cookie + gRPC me)
      lib/                 types.ts (User из proto)
      ui/                  user-menu, user-avatar
  features/                пользовательские фичи = срез по юзкейсу
    auth/
      ui/                  AuthDialog, AuthForm, AuthDialogProvider
      lib/                 login(), register() — обёртки над fetch в BFF
  widgets/                 крупные композиции для роутов
    navbar/                Navbar (server), NavbarAuthButton (client),
                           ThemeToggle (client), UserMenu композиция
  lib/                     серверная инфраструктура BFF (БЕЗ изменений)
    grpc/                  Connect-клиент + маппинг ошибок + сериализация
    session/               httpOnly cookie (set/clear/read)
  gen/                     proto→TS (DO NOT EDIT)
```

### 2. Правила импортов (ядро FSD)

Слои упорядочены сверху вниз: `app → widgets → features → entities → shared`.
**Слой может импортить только нижележащие** (и `lib/`, который инфраструктурный):

- `app/**` → `widgets`, `features`, `entities`, `shared`, `lib`.
- `widgets/**` → `features`, `entities`, `shared` (не в `app`).
- `features/**` → `entities`, `shared` (не в `widgets`, не в чужие `features`).
- `entities/**` → `shared`, `lib` (серверная модель может ходить в `lib/grpc`,
  `lib/session`). Не в `features`/`widgets`.
- `shared/**` → только внутрь `shared` (без бизнес-логики, без `entities`).
- `lib/` — серверная инфраструктура, импортирует только `@/gen` и внешние пакеты.

`features` **не импортируют друг друга**. Если двум фичам нужна общая логика —
она спускается в `entities` или `shared`. Cross-feature композиция возможна
только в `widgets` или `app`.

Внутри слоя — сегменты (`ui`, `model`, `lib`, `config`). Импорты внутри одного
слоя между сегментами разрешены. Public API сегмента — его index/barrel по
необходимости; предпочтительнее прямые импорты конкретных файлов для
tree-shaking и навигации агентами.

### 3. shadcn/ui в `shared/ui`

shadcn-компоненты **коммитятся** в репо и **могут правиться** руками. Это НЕ
`gen/`/`sqlc/` — это исходный код проекта (см. ADR 0004, который касается
только proto/sql генерации). `components.json` настроен на алиасы:

- `ui: @/shared/ui` — куда складывать компоненты.
- `utils: @/shared/lib/cn` — функция `cn` (clsx + tailwind-merge).
- `lib: @/shared/lib`, `hooks: @/shared/hooks`.

Стиль shadcn: `new-york`, базовая палитра — `zinc`, CSS-переменные темы включены.

### 4. Тема: тёмная + светлая через next-themes

- `next-themes` `ThemeProvider` (`attribute="class"`, `defaultTheme="dark"`,
  `enableSystem={false}`) в root layout.
- `<html lang="en" suppressHydrationWarning>` — обязательно для next-themes,
  иначе hydration warning на классе темы.
- `src/app/globals.css`: Tailwind v4 entry (`@import "tailwindcss";`) + CSS-
  переменные `:root` (light) и `.dark` (dark) в формате shadcn.
- Переключатель `ThemeToggle` (client) — `next-themes` `useTheme()` +
  `DropdownMenu` / `Button`.

### 5. Auth UX: модалка + deep-link

- `AuthDialogProvider` (client context) в root layout — рендерит единственный
  `<AuthDialog>` (shadcn `Dialog` + `Tabs`: Вход/Регистрация), экспозит
  `open(mode: "login" | "register")` / `close()`.
- Навбар: для гостя — `NavbarAuthButton` (client), вызывает `open(mode)` без
  смены URL (нативный modal UX). Для залогина — `UserMenu` (client dropdown)
  с именем/email и «Выйти».
- Deep-link: роуты `/login` и `/register` **остаются**. При прямом заходе
  рендерят client-stub, который на mount зовёт `open(mode)` и
  `router.replace("/")`. Итог: пользователь на главной с открытой модалкой.
  Dashboard при истёкшем токене редиректит на `/login` — открывается форма.
- `AuthForm` (рефактор): shadcn `Input`/`Label`/`Button`/`Alert`, режим из
  активной табы. Успех → `close()` + `router.push("/dashboard")` +
  `router.refresh()`. Ходит в BFF по REST (как раньше), контракт не меняется.

### 6. Auth-состояние в server components

`entities/user/model/get-current-user.ts` — единственное место, достающее
пользователя на сервере: читает `getAccessToken()` из httpOnly cookie, зовёт
`authClient.me()` с Bearer, при отсутствии/ошибке возвращает `null` (не
редиректит — редирект делает вызывающий роут). Используется навбаром
(server component), лендингом, dashboard. Устраняет дублирование логики.

### 7. BFF и инфраструктура — без изменений

`src/lib/grpc/`, `src/lib/session/`, `src/app/api/auth/**` не трогаются.
Правила из `web/AGENTS.md` (токены только в httpOnly cookie, gRPC-клиент
только на сервере, route handlers Node runtime) сохраняются. Новая фича
`features/auth/lib/login.ts` — тонкая обёртка над `fetch("/api/auth/login")`,
не добавляет новой логики безопасности.

## Обоснование

- **FSD-aligned, не pure FSD**: pure FSD (страницы в `src/pages/`, App Router
  как тонкий shell) дублирует роутинг Next.js и усложняет server components /
  layouts / metadata, которые живут в `app/`. App Router уже даёт нам
  file-based routing, layouts, RSC — нет смысла их оборачивать. FSD-слои
  организуют **переиспользуемый** код, который App Router сам по себе не
  структурирует. Получаем best of both worlds.
- **Правила импортов** — главное, что даёт FSD: предсказуемые границы, нет
  циклов, нет «всё импортит всё». Для AI-агента это критично — по пути
  импорта видно, где жить коду. ESLint rule для проверки границ — будущий
  инкремент (не блокирует).
- **shadcn в `shared/ui`**: shadcn — это не библиотека в `node_modules`, а
  «копипаст-компоненты», которыми мы владеем. `shared` — естественное место:
  они не несут бизнес-смысла и используются всеми слоями. Коммитить их можно
  (это наш код, не вывод генерации).
- **next-themes + CSS-переменные**: стандартный подход shadcn, минимальная
  конфигурация, хорошо сочетается с server components
  (`suppressHydrationWarning` на `<html>` решает hydration warning).
- **Auth-модалка + deep-link**: модалка из навбара — современный UX, не
  уводит со страницы. Сохранение `/login`, `/register` — дружелюбный
  deep-link и работает с существующим dashboard-редиректом.
- **`getCurrentUser` в entities/user/model**: устраняет дублирование, кладёт
  логику в правильный слой (сущность `user` знает, как себя получить), не
  протекает в `shared` (там нет gRPC).

## Последствия

- **Новая структура** фиксируется в `web/AGENTS.md` (раздел «Структура») и
  `docs/conventions.md` (раздел «UI»).
- **Сгенерированный код** по-прежнему не коммитится (`gen/`, `sqlc/`).
  shadcn-компоненты в `shared/ui` — **коммитятся и правятся** (это не gen).
- **Проверка границ импортов** — будущий инкремент (ESLint plugin или
  `dependency-cruiser` rule). Пока правило работает на уровне конвенции и
  ревью.
- **zod + react-hook-form** — следующий инкремент. Сейчас формы на
  controlled `useState` + native HTML validation, но уже на shadcn-примитивах.
- **Middleware-защита роутов** — будущий инкремент (для admin-зоны особенно).
  Сейчас auth-gating в server components через `getCurrentUser`.
- **Админка (next increment)**: структура уже оставляет место — `entities/user`
  готов принять `role` (когда proto `User` получит поле + миграция + JWT claim),
  будущий `app/(admin)/*` route group + `middleware.ts` guard + отдельный ADR
  по RBAC.

## Альтернативы

- **Pure FSD** (`src/pages/` + App Router как shell) — отклонено: дублирование
  роутинга, усложнение RSC/layouts.
- **Pragmatic co-location** (defalt shadcn: `src/components/ui` +
  `src/components/`, без FSD-слоёв) — отклонено: слабее структурирует
  растущий UI, нет правил границ импортов.
- **Только тёмная тема** — отклонено пользователем: выбраны обе + toggle.

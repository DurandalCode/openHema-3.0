# ADR 0006: State Management — TanStack Query + Zustand + useState

- Статус: принято
- Дата: 2026-07-06

## Контекст

После ADR 0005 (UI-архитектура) клиент `/web` получил FSD-слои и shadcn/ui.
Серверные данные берутся в Server Components напрямую (cookie + gRPC через
`entities/user/model/get-current-user.ts`), auth-мутации — ручным
`fetch("/api/auth/*")` + `useState(loading/error)` + try/finally, а UI-состояние
AuthDialog — на React Context с провайдером в root layout.

По мере роста UI этого станет недостаточно:

- **Server state в client-компонентах**: появятся списки с фильтрами, пагинацией,
  optimistic-обновлениями, polling. Делать это на `useEffect`+`useState` —
  boilerplate, race-conditions, нет кеша/дедупликации.
- **Cross-component UI-состояние**: AuthDialog — первый пример. Context работает,
  но требует провайдера, бойлерплейт растёт с каждым новым UI-стором.
- **Локальный стейт компонента**: `useState` — всегда уместен, не заменяется.

Нужно зафиксировать слоистый подход: какой инструмент для какого состояния.

## Решение

### 1. Три слоя состояния

| Слой | Инструмент | Назначение |
|------|------------|------------|
| Server state (данные с бэка в client-компонентах) | **TanStack Query v5** | Кеш, дедупликация, background refetch, мутации + инвалидация, optimistic, polling, пагинация |
| UI state (cross-component, client-only) | **Zustand v5** | Глобальный client-side стейт UI (модалки, UI-фильтры не-серверные). Без провайдеров. |
| Local component state | `useState` / `useReducer` | Стейт одного компонента (поле формы, локальный dropdown). Всегда уместен. |

### 2. TanStack Query + Server Components — coexistence

**Server Components — дефолт для данных.** SSR, SEO, ноль JS в браузере, прямые
вызовы gRPC через `lib/grpc`. Не дублируем server-side получение в RQ без
реальной потребности — это создало бы два источника истины.

**RQ — для client-fetched данных.** Когда данные нужны в client-компоненте
(интерактивные списки, мутации с инвалидацией, polling, optimistic). BFF отдаёт
REST, RQ кеширует на клиенте.

**Prefetch + `HydrationBoundary`** — когда нужен SSR-initial + client-refetch:
Server Component зовёт `queryClient.prefetchQuery(...)`, оборачивает client-
subtree в `<HydrationBoundary state={dehydrate(queryClient)}>`. Client-хук
`useQuery` с тем же key читает данные мгновенно, без flash. Применим к первой
реальной client-data фиче (tournaments list, след. инкремент).

**`QueryClient`**: per-request на сервере (factory `makeQueryClient()`),
singleton в браузере (`useState(() => makeQueryClient())` в provider).
`staleTime: 60_000` дефолт — чтобы клиент не рефетчил сразу после hydration.

### 3. Query key conventions

Иерархические ключи: `['feature', 'scope', ...params]`.

```
['auth', 'me']                              — текущий пользователь (клиент)
['tournaments', 'list', { status, page }]   — список турниров
['tournaments', 'detail', id]               — детали турнира
```

Ключи живут в `features/<f>/api/keys.ts`:

```ts
export const authKeys = {
  me: ['auth', 'me'] as const,
};
```

Инвалидация: `queryClient.invalidateQueries({ queryKey: ['tournaments'] })`
сбрасывает весь subtree ключей.

### 4. Mutation pattern

Мутации — `useMutation` с колбэками:

- `mutationFn` — тонкая обёртка над fetcher из `features/<f>/api/requests.ts`.
- `onSuccess` — side-effects (router.push, close dialog, invalidateQueries).
- Опционально `onError`, optimistic через `onMutate` + `setQueryData`.

`useQuery` и `useMutation` **не делают `fetch` сами** — они зовут fetchers из
`api/requests.ts`. Транспортная логика в одном месте, fetchers тестируются
изолированно.

### 5. Zustand — правила

- **Только client UI state.** Никаких server data в zustand-сторе — на сервере
  state shared между запросами разных пользователей (утечка данных).
- **Без провайдеров.** `create()` создаёт глобальный store, доступ через
  селектор `useXxxStore((s) => s.field)`. Не оборачиваем в Provider.
- **Server-безопасность**: store не дёргает browser API на верхнем уровне
  (только внутри экшенов, зовущихся из client-компонентов).
- **SSR-инициализация** (если нужна): server component передаёт данные через
  props в client-компонент, тот вызывает `useXxxStore.setState(...)` в
  `useEffect`. Не кладём начальное состояние в `create()`.

### 6. FSD-размещение

```
features/<f>/
  api/                      внешние запросы + RQ-хуки
    requests.ts             fetchers (loginRequest, ...) — чистый транспорт
    keys.ts                 query/mutation keys
    use-<action>.ts         useMutation / useQuery хуки
  model/                    zustand stores (UI state фичи)
    <name>-store.ts
  ui/                       React-компоненты фичи
  lib/                      вспомогательная логика (не api, не store)
```

`entities/<e>/api/` — то же для сущностей (query hooks: `useUser`, `useUsers`).
`shared/` — только `lib/query-client.ts`, `lib/query-provider.tsx` (инфра RQ).

### 7. Devtools

`@tanstack/react-query-devtools` — `<ReactQueryDevtools initialIsOpen={false} />`
в `QueryProvider`, только в dev (`process.env.NODE_ENV === 'development'`).
Tree-shaken в prod.

## Обоснование

- **Server state ≠ client state.** Server data remote, shared, stale, refetched;
  UI state local, ephemeral, client-only. Разные инструменты — разные проблемы.
- **RQ — стандарт для server state в React** (v5 stable, App Router support
  через `HydrationBoundary`). Кеш/дедупликация/refetch/оптимистичные мутации
  из коробки — не пишем это на `useEffect`.
- **Zustand — минимальный UI-state.** ~1 KB, без провайдеров, hook-based.
  Убирает Context-бойлерплейт для cross-component UI state.
- **`useState` не заменяется.** Локальный стейт — всегда `useState`. Не тянем
  RQ/zustand туда, где достаточно локального состояния.

## Последствия

- **Новые правила** зафиксированы в `web/AGENTS.md` и `docs/conventions.md`.
- **Auth-мутации** рефакторятся на `useMutation` (убирает `loading`/`error`
  boilerplate). Fetchers переезжают в `features/auth/api/requests.ts`.
- **AuthDialog** переезжает с React Context на zustand store — убираем
  `AuthDialogProvider`, `<AuthDialog/>` монтируется напрямую в layout.
- **Prefetch + `HydrationBoundary`** — применяем в следующем инкременте
  (tournaments list). Сейчас документировано в ADR.
- **Client `useCurrentUser` RQ-хук** не добавляем — нет потребности (server-side
  `getCurrentUser` покрывает navbar/landing/dashboard). Добавим когда появится
  client-компонент без server-родителя, которому нужен current user.

## Альтернативы

- **Только RQ, без zustand** — отклонено: RQ не для UI-state (модалки/табы).
  Context работает, но бойлерплейт растёт. Zustand чище для cross-component UI.
- **Только zustand, без RQ** — отклонено: server state в zustand — утечка между
  запросами на сервере, нет кеша/refetch/инвалидации. RQ — правильный инструмент.
- **SWR вместо RQ** — отклонено: RQ шире (мутации first-class, devtools,
  гидрация), стандартизирован в команде.
- **Redux Toolkit вместо связки** — отклонено: избыточен для пет-проекта,
  больше boilerplate.

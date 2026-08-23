import {
  QueryCache,
  QueryClient,
  defaultShouldDehydrateQuery,
} from "@tanstack/react-query";
import { UnauthorizedError } from "@/shared/api/unauthorized";
import { useSessionExpiredStore } from "./session-expired-store";

/**
 * makeQueryClient — factory для QueryClient.
 *
 * На сервере (SSR/prefetch) создаём новый инстанс на каждый запрос —
 * иначе кеш утечёт между пользователями.
 *
 * В браузере — singleton через `useState(() => makeQueryClient())` в
 * QueryProvider (см. shared/lib/query-provider.tsx).
 *
 * staleTime 60s — чтобы клиент не рефетчил сразу после hydration.
 *
 * `queryCache.onError` — глобальный перехват `UnauthorizedError` (спека
 * 0038, FR-18): любой запрос кабинета/подачи заявки, отклонённый BFF как
 * неаутентифицированный, поднимает `useSessionExpiredStore` вместо тихого
 * падения запроса в угол экрана. `useSessionExpiredStore` — модульный
 * singleton; сегодня в проекте нет server-side prefetch/`dehydrate` через
 * этот клиент (см. grep по `dehydrate`/`prefetchQuery` в `web/src`) — запросы
 * выполняются только в браузере, поэтому пересечения между пользователями на
 * сервере нет. Если появится SSR-префетч этим клиентом, это место нужно
 * пересмотреть.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (error instanceof UnauthorizedError) {
          useSessionExpiredStore.getState().open("query");
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
}

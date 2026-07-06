import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";

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
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
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

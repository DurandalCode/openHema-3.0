import {
  MutationCache,
  QueryCache,
  QueryClient,
  defaultShouldDehydrateQuery,
  type Query,
} from "@tanstack/react-query";
import { UnauthorizedError } from "@/shared/api/unauthorized";
import { useSessionExpiredStore } from "./session-expired-store";

// attemptSilentRefresh — тот же `/api/auth/refresh`, что вызывает
// `middleware.ts` при навигации (см. `session-refresh.ts`). Один
// in-flight промис на несколько одновременно упавших с 401 запросов
// (обычная ситуация — кабинет открывает 2-3 query разом): без дедупа
// каждый запустил бы свой POST.
let inFlightRefresh: Promise<boolean> | null = null;

function attemptSilentRefresh(): Promise<boolean> {
  if (!inFlightRefresh) {
    inFlightRefresh = fetch("/api/auth/refresh", { method: "POST" })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        inFlightRefresh = null;
      });
  }
  return inFlightRefresh;
}

// Мутация (спека 0038, AC-10): пользователь только что нажал «Подать
// заявку»/«Сохранить» — действие не выполнилось. Тихо продлить сессию и
// притвориться, что ничего не случилось, нельзя: сама мутация не
// повторяется автоматически (это могло бы задвоить отправку), поэтому
// пользователь должен узнать и повторить действие сам — диалог открывается
// сразу, без попытки silent refresh.
function onMutationUnauthorized(error: unknown): void {
  if (error instanceof UnauthorizedError) {
    useSessionExpiredStore.getState().open("query");
  }
}

/**
 * makeQueryUnauthorizedHandler — обработчик 401 от запроса, привязанный к
 * конкретному `client` (замыкание, см. `makeQueryClient`). Запрос —
 * идемпотентное чтение (дашборд, список заявок и т.п.), поэтому вместо
 * диалога сразу пробуем один раз тихо продлить сессию и перечитать данные
 * (FR-14 «незаметно» — раньше это работало только на пути навигации через
 * middleware, не на пути фонового query/XHR).
 *
 * `attemptedFor` — защита от зацикливания ВНУТРИ одного эпизода истечения
 * сессии: если refresh «удался», но перечитанный запрос ВСЁ РАВНО падает с
 * 401 (сам refresh не помог для этого конкретного ресурса, либо второй
 * одновременный логаут), повторный подряд вызов для того же `queryKey` не
 * пробует освежить сессию ещё раз — `invalidateQueries` внутри `.then`
 * иначе вызывал бы этот же обработчик снова и снова.
 *
 * Ключ **обязательно** убирается из `attemptedFor`, когда вызванный им
 * `invalidateQueries` устаканился (успешно или нет) — не только в ветке
 * повторного провала. Без этого, если рефетч после успешного refresh
 * ПРОШЁЛ, ключ навсегда оставался бы в множестве, и КАЖДОЕ следующее,
 * никак не связанное истечение сессии для того же запроса (а access-токен
 * истекает каждые ~15 минут естественным образом, плюс TanStack Query по
 * умолчанию перечитывает данные при возврате фокуса на вкладку) сразу
 * показывало бы диалог, вообще не пробуя тихое продление — именно так
 * нашли этот баг: живая сессия стала выкидывать пользователя заметно чаще,
 * чем ожидалось, потому что механизм тихого восстановления фактически
 * срабатывал только один раз за всю жизнь вкладки на каждый ключ запроса.
 */
function makeQueryUnauthorizedHandler(getClient: () => QueryClient) {
  const attemptedFor = new Set<string>();

  return function onQueryUnauthorized(
    error: Error,
    query: Query<unknown, unknown, unknown, readonly unknown[]>,
  ): void {
    if (!(error instanceof UnauthorizedError)) return;
    const key = JSON.stringify(query.queryKey);

    if (attemptedFor.has(key)) {
      attemptedFor.delete(key);
      useSessionExpiredStore.getState().open("query");
      return;
    }

    void attemptSilentRefresh().then((refreshed) => {
      if (refreshed) {
        attemptedFor.add(key);
        void getClient()
          .invalidateQueries({ queryKey: query.queryKey, exact: true })
          .finally(() => {
            // Не-op, если сюда уже прошёлся провальный повтор выше (ключ
            // удалён им) — иначе снимает разовую метку после успеха.
            attemptedFor.delete(key);
          });
      } else {
        useSessionExpiredStore.getState().open("query");
      }
    });
  };
}

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
 * `queryCache`/`mutationCache`.`onError` — глобальный перехват
 * `UnauthorizedError` (спека 0038, FR-18): любой запрос ИЛИ мутация
 * кабинета/подачи заявки, отклонённые BFF как неаутентифицированные,
 * поднимают `useSessionExpiredStore` вместо тихого падения в угол экрана
 * (тост общей ошибки, пустой список). Мутации нужен свой `MutationCache` —
 * `QueryCache.onError` его не ловит, это раздельные подсистемы RQ.
 * Запрос перед этим пробует тихо продлить сессию (`onQueryUnauthorized`) —
 * мутация нет (см. её комментарий). `useSessionExpiredStore` — модульный
 * singleton; сегодня в проекте нет server-side prefetch/`dehydrate` через
 * этот клиент (см. grep по `dehydrate`/`prefetchQuery` в `web/src`) —
 * запросы выполняются только в браузере, поэтому пересечения между
 * пользователями на сервере нет. Если появится SSR-префетч этим клиентом,
 * это место нужно пересмотреть.
 *
 * `clientRef.current` заполняется сразу после конструирования кэшей —
 * `getClient()` не вызывается синхронно при создании `QueryCache`, только
 * позже, когда какой-то запрос реально упадёт, так что к моменту вызова
 * ссылка уже заполнена (forward-reference на сам клиент из его же кэшей,
 * которым он передаётся конструктором; `{ current }`, а не `let client`, —
 * `client` при этом остаётся честным `const`, без реассайна).
 */
export function makeQueryClient(): QueryClient {
  const clientRef: { current: QueryClient | undefined } = { current: undefined };

  const queryCache = new QueryCache({
    onError: makeQueryUnauthorizedHandler(() => clientRef.current!),
  });
  const mutationCache = new MutationCache({ onError: onMutationUnauthorized });

  const client = new QueryClient({
    queryCache,
    mutationCache,
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
  clientRef.current = client;
  return client;
}

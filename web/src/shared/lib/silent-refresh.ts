import { useSessionExpiredStore } from "./session-expired-store";

/**
 * silent-refresh — тихое продление сессии с клиента: тот же
 * `POST /api/auth/refresh`, что зовёт `middleware.ts` при запросе к BFF.
 * Вынесено из `query-client.ts`, потому что теперь этим пользуется не только
 * TanStack Query, но и fire-and-forget вызовы таймера арены.
 *
 * Один in-flight промис на несколько одновременно упавших с 401 запросов
 * (обычная ситуация — кабинет открывает 2-3 query разом; консоль арены шлёт
 * кадр таймера каждые ~200мс): без дедупа каждый запустил бы свой POST.
 */
let inFlightRefresh: Promise<boolean> | null = null;

export function attemptSilentRefresh(): Promise<boolean> {
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

/**
 * FAILED_REFRESH_COOLDOWN_MS — пауза после неудачного продления.
 *
 * `inFlightRefresh` схлопывает ПАРАЛЛЕЛЬНУЮ бурю (кадры на t, t+200, t+400,
 * пока POST ещё открыт), но не последовательную: если refresh стабильно
 * падает (refresh-токен мёртв, Go лежит), консоль арены слала бы по 5
 * обречённых POST в секунду бесконечно. Cooldown ограничивает это одним
 * запросом в 30 секунд.
 *
 * Побочный бонус — самолечение: если секретарь перелогинился в соседней
 * вкладке, консоль тихо восстановится в течение 30 секунд, вместо того
 * чтобы навсегда остаться за диалогом.
 */
const FAILED_REFRESH_COOLDOWN_MS = 30_000;
let lastFailedRefreshAtMs = 0;

/**
 * recoverSessionOrNotify — политика для fire-and-forget вызывающих, у
 * которых нет своего обработчика 401: попробовать продлить сессию, и только
 * если не вышло — поднять диалог «Сессия истекла».
 *
 * Во время cooldown возвращает `false` МОЛЧА, без повторного `open()`:
 * диалог уже открыт тем отказом, который cooldown и запустил, а дёргать
 * zustand по 5 раз в секунду незачем.
 */
export async function recoverSessionOrNotify(): Promise<boolean> {
  if (Date.now() - lastFailedRefreshAtMs < FAILED_REFRESH_COOLDOWN_MS) return false;

  const refreshed = await attemptSilentRefresh();
  if (refreshed) {
    lastFailedRefreshAtMs = 0;
    return true;
  }

  lastFailedRefreshAtMs = Date.now();
  useSessionExpiredStore.getState().open("query");
  return false;
}

/**
 * resetSilentRefreshStateForTests — сброс модульного состояния (in-flight +
 * cooldown). Только для тестов: состояние делится между всеми импортёрами,
 * и без сброса в `beforeEach` файлы начали бы зависеть от порядка запуска.
 */
export function resetSilentRefreshStateForTests(): void {
  inFlightRefresh = null;
  lastFailedRefreshAtMs = 0;
}

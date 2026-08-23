/**
 * UnauthorizedError — сигнал «сессия неаутентифицирована» из клиентского
 * запроса (спека 0038, FR-18). Ловится глобальным `QueryCache.onError`
 * (`shared/lib/query-provider.tsx`) и поднимает `useSessionExpiredStore`.
 */
export class UnauthorizedError extends Error {
  constructor(message = "unauthenticated") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** ensureAuthorized — бросает UnauthorizedError на 401, иначе no-op. */
export function ensureAuthorized(res: Response): void {
  if (res.status === 401) {
    throw new UnauthorizedError();
  }
}

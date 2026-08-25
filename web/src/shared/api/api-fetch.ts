import { UnauthorizedError } from "./unauthorized";

/**
 * ApiResult — единый результат клиентского запроса (спека 0039, T5, FR-17).
 * `status` на ветке отказа опционален и отсутствует при сетевом сбое (нет
 * HTTP-ответа вовсе) — но заполняется на любом полученном не-2xx статусе,
 * не только там, где вызывающий фетчер собирается его прочитать: часть
 * существующих фетчеров (`registrationErrorMessage`, `presetErrorMessage`,
 * `tournamentErrorMessage`, ...) переводит 409/400/403 в русский текст по
 * этому статусу, и `apiFetch` не должен его терять.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

/**
 * apiFetch — единственная точка входа клиентских fetcher'ов к BFF (спека
 * 0039, план §«Блок D»). Ключевое инвариант (NFR-5, FR-17): 401 бросает
 * `UnauthorizedError` ДО чтения тела ответа и ВНЕ сетевого `try/catch` —
 * иначе он попал бы в `catch` ниже и превратился бы в проглоченное
 * `{ok:false, error:"Сеть недоступна"}`, как это годами делали фетчеры до
 * этой спеки. Бросок происходит даже если тело ответа не JSON (сервер отдал
 * пустой 401 или HTML) — `res.json()` для 401-ветки вообще не вызывается.
 *
 * Дальше 401 подхватывает уже готовая цепочка спеки 0038:
 * `QueryCache`/`MutationCache.onError` (`shared/lib/query-client.ts`) →
 * тихая попытка продлить сессию → диалог «Сессия истекла»
 * (`widgets/session-expired/session-expired-dialog.tsx`).
 *
 * Сетевой сбой (сам `fetch` упал — офлайн, DNS, CORS) — единственная ветка,
 * которую эта функция глотает и превращает в `{ok:false}`: разворачивать её
 * пользователю как «сессия истекла» было бы неверно.
 */
export async function apiFetch<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }

  if (res.status === 401) {
    throw new UnauthorizedError();
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error ?? "Ошибка запроса", status: res.status };
  }

  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: true, data };
}

import { cookies, headers } from "next/headers";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/shared/config/session-cookies";

export { ACCESS_COOKIE, REFRESH_COOKIE };

// TTL cookie (в секундах). Должны примерно соответствовать TTL токенов на сервере.
const ACCESS_MAX_AGE = 15 * 60; // 15 минут
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60; // 30 дней

const isProd = process.env.NODE_ENV === "production";

/** setSessionCookies кладёт токены в httpOnly-cookie. */
export async function setSessionCookies(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  const store = await cookies();
  // Secure — только если запрос пришёл по https (туннель/Caddy шлют
  // X-Forwarded-Proto: https; Next сам ставит "http" без прокси). Иначе
  // браузер молча выбросит cookie при входе по LAN-адресу http://<ip>:3000.
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim();
  const base = {
    httpOnly: true,
    secure: proto ? proto === "https" : isProd,
    sameSite: "lax" as const,
    path: "/",
  };
  store.set(ACCESS_COOKIE, accessToken, { ...base, maxAge: ACCESS_MAX_AGE });
  store.set(REFRESH_COOKIE, refreshToken, { ...base, maxAge: REFRESH_MAX_AGE });
}

/** clearSessionCookies удаляет токены (logout). */
export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

/** getAccessToken читает access-токен из cookie (или undefined). */
export async function getAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value;
}

/** getRefreshToken читает refresh-токен из cookie (или undefined). */
export async function getRefreshToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value;
}

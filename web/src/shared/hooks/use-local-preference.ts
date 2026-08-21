"use client";

import { useEffect, useState } from "react";

/**
 * useLocalPreference — типизированное чтение/запись одного значения в
 * `localStorage` с SSR-безопасным дефолтом (спека 0033, потребитель —
 * тумблер оформления табло, FR-31, ключ `scoreboard-appearance:<arenaId>`).
 * Общий хук без доменного смысла — `shared`, не `features`.
 *
 * Чтение хранилища отложено в `useEffect` (не в лениво-инициализированный
 * `useState`): на сервере при первом рендере компонент обязан отдать
 * `defaultValue`, иначе гидратация не совпадёт с клиентом (SSR/CSR
 * mismatch). Доступ к `localStorage` обёрнут в `try/catch` — приватный
 * режим браузера и SSR-полифиллы иногда бросают на чтении/записи, и это не
 * повод ронять компонент.
 */
export function useLocalPreference<T extends string>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) setValue(stored as T);
    } catch {
      // localStorage недоступен — остаёмся на defaultValue.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function setPreference(next: T) {
    setValue(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // localStorage недоступен — значение живёт только в состоянии сессии.
    }
  }

  return [value, setPreference];
}

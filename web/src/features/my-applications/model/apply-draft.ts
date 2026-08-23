/**
 * apply-draft — локальный черновик формы подачи заявки (спека 0038,
 * FR-19..FR-21). Чистый TS-модуль, не React-хук: используется и из
 * эффекта монтирования формы, и из обработчика успешной отправки.
 *
 * Черновик привязан к номинации: ключ `hema:apply-draft:<nominationId>`
 * (FR-21 — черновики разных номинаций не пересекаются и не переносятся).
 * `hasAnyDraft` нужен экрану «Сессия истекла» (FR-20 — сказать «черновик
 * сохранён» только когда он действительно есть), поэтому переборщик ключей
 * знает только префикс, а не список номинаций.
 *
 * Каждое обращение к `localStorage` обёрнуто в try/catch по образцу
 * `shared/hooks/use-local-preference.ts`: приватный режим браузера,
 * отключённые cookies и SSR-полифиллы иногда бросают на чтении/записи —
 * это не повод ронять форму или терять уже введённый текст.
 */

const KEY_PREFIX = "hema:apply-draft:";

function draftKey(nominationId: string): string {
  return `${KEY_PREFIX}${nominationId}`;
}

/** saveDraft — сохраняет черновик формы для номинации. Недоступный localStorage — no-op. */
export function saveDraft<T>(nominationId: string, data: T): void {
  try {
    window.localStorage.setItem(draftKey(nominationId), JSON.stringify(data));
  } catch {
    // localStorage недоступен — черновик живёт только в состоянии формы.
  }
}

/**
 * loadDraft — читает черновик формы для номинации. Отсутствующий ключ,
 * повреждённый JSON или недоступный localStorage — везде `null`, не throw.
 */
export function loadDraft<T>(nominationId: string): T | null {
  try {
    const raw = window.localStorage.getItem(draftKey(nominationId));
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** clearDraft — удаляет черновик номинации (после успешной подачи, FR-21). No-op, если его нет. */
export function clearDraft(nominationId: string): void {
  try {
    window.localStorage.removeItem(draftKey(nominationId));
  } catch {
    // localStorage недоступен — нечего удалять.
  }
}

/** hasAnyDraft — есть ли хоть один сохранённый черновик подачи заявки (FR-20). */
export function hasAnyDraft(): boolean {
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(KEY_PREFIX)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

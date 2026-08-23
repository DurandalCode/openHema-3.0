// MIN_PASSWORD_LEN зеркалит server/modules/auth/service/password_policy.go
// (MinPasswordLen) — та же константа, что уже продублирована в
// web/src/app/api/auth/password-reset/confirm/route.ts (FR-11). Единая
// политика длины пароля: сервер и клиент считают ровно одно и то же правило,
// без словарей и оценки энтропии (spec 0038, решение 5) — иначе клиент и
// сервер могли бы разойтись во мнении о «силе» пароля.
export const MIN_PASSWORD_LEN = 8;

export type PasswordHint = {
  /** 0 — пусто, 1 — короче MIN_PASSWORD_LEN, 2 — достаточно длинный. */
  level: 0 | 1 | 2;
  /** true, если длина >= MIN_PASSWORD_LEN. */
  ok: boolean;
  /** Подсказка о правиле; пустая строка, когда ok. */
  text: string;
};

const HINT_TEXT = `не меньше ${MIN_PASSWORD_LEN} символов`;

/**
 * passwordHint — клиентская проверка пригодности пароля (FR-6). Считает
 * ровно то же правило, что сервер: длину. Не источник истины — сервер
 * перепроверяет всё равно; здесь только для UX (индикатор + блокировка
 * отправки формы при коротком пароле).
 */
export function passwordHint(value: string): PasswordHint {
  const ok = value.length >= MIN_PASSWORD_LEN;
  if (ok) {
    return { level: 2, ok: true, text: "" };
  }
  const level = value.length === 0 ? 0 : 1;
  return { level, ok: false, text: HINT_TEXT };
}

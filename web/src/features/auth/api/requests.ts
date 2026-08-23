export type AuthMode = "login" | "register" | "reset";

export type AuthResult = { ok: true } | { ok: false; error: string };

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterInput = {
  email: string;
  password: string;
  displayName: string;
};

/** loginRequest — POST /api/auth/login (BFF). Клиент-сейв: только fetch. */
export async function loginRequest(input: LoginInput): Promise<AuthResult> {
  return post("/api/auth/login", input);
}

/** registerRequest — POST /api/auth/register (BFF). Клиент-сейв: только fetch. */
export async function registerRequest(
  input: RegisterInput,
): Promise<AuthResult> {
  return post("/api/auth/register", input);
}

/** logoutRequest — POST /api/auth/logout (BFF). Очищает httpOnly-cookie. */
export async function logoutRequest(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
}

/**
 * requestPasswordReset — POST /api/auth/password-reset (BFF, spec 0037
 * FR-1/FR-2). Ответ одинаковый независимо от того, существует ли аккаунт —
 * компонент не должен пытаться различить причины (FR-8).
 */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  return post("/api/auth/password-reset", { email });
}

export type ResetPasswordInput = {
  token: string;
  password: string;
};

/**
 * resetPassword — POST /api/auth/password-reset/confirm (BFF, spec 0037
 * FR-7/FR-8). Не выдаёт сессию при успехе (FR-11 spec 0038).
 */
export async function resetPassword(
  input: ResetPasswordInput,
): Promise<AuthResult> {
  return post("/api/auth/password-reset/confirm", input);
}

async function post(url: string, body: unknown): Promise<AuthResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

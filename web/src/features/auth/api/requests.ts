export type AuthMode = "login" | "register";

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

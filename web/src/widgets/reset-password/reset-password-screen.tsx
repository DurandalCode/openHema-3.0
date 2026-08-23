"use client";

import { useState } from "react";
import Link from "next/link";
import { ResetPasswordForm } from "@/features/auth/ui/reset-password-form";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

type ScreenState = "form" | "success" | "invalid";

/**
 * ResetPasswordScreen — экран страницы по ссылке из письма восстановления
 * (spec 0038, FR-9..FR-13). Публичный роут `/reset-password?token=...`
 * (сервер письма формирует именно этот адрес, spec 0037). Клиентский —
 * состояние формы/успеха/отказа живёт на клиенте.
 *
 * Пустой/отсутствующий token трактуется так же, как недействительная
 * ссылка (FR-13) — форма пароля не рендерится вообще.
 */
export function ResetPasswordScreen({ token }: { token: string }) {
  const [state, setState] = useState<ScreenState>(token ? "form" : "invalid");

  if (state === "success") {
    return (
      <Layout>
        <Card>
          <CardHeader>
            <CardTitle>Пароль установлен</CardTitle>
            <CardDescription>
              Новый пароль сохранён. Сессия не выдана — войдите обычным
              способом.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/login">Войти</Link>
            </Button>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  if (state === "invalid") {
    return (
      <Layout>
        <Card>
          <CardHeader>
            <CardTitle>Ссылка недействительна или устарела</CardTitle>
            <CardDescription>
              Запросите новую ссылку восстановления на странице входа.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Открыть вход</Link>
            </Button>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <Card>
        <CardHeader>
          <CardTitle>Новый пароль</CardTitle>
          <CardDescription>
            Задайте новый пароль для входа в аккаунт.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm
            token={token}
            onSuccess={() => setState("success")}
            onInvalidToken={() => setState("invalid")}
          />
        </CardContent>
      </Card>
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-16">
      {children}
    </div>
  );
}

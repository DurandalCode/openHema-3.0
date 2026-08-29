"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useVerifyEmail } from "@/features/profile/api/use-verify-email";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

type ScreenState = "pending" | "success" | "invalid";

/**
 * VerifyEmailScreen — экран страницы `/verify-email?token=...` (спека
 * 0042, FR-3). Публичный роут, ссылку формирует письмо подтверждения
 * (FR-2). В отличие от `ResetPasswordScreen` (spec 0038) — без формы
 * ввода: RPC дёргается сразу при монтировании (переход по ссылке = само
 * действие).
 *
 * Пустой/отсутствующий token — сразу «недействительна», без обращения к
 * серверу (тот же приём, что `ResetPasswordScreen`). Ошибка RPC (в т.ч.
 * повторный переход по уже погашенной ссылке) — тот же единый отказ.
 */
export function VerifyEmailScreen({ token }: { token: string }) {
  const [state, setState] = useState<ScreenState>(token ? "pending" : "invalid");
  const verifyEmail = useVerifyEmail();
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verifyEmail.mutate(token, {
      onSuccess: () => setState("success"),
      onError: () => setState("invalid"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === "success") {
    return (
      <Layout>
        <Card>
          <CardHeader>
            <CardTitle>Адрес подтверждён</CardTitle>
            <CardDescription>Ваш email привязан к учётке.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/dashboard">Открыть кабинет</Link>
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
              Запросите новое письмо подтверждения в кабинете.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard">Открыть кабинет</Link>
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
          <CardTitle>Подтверждаем адрес…</CardTitle>
          <CardDescription>Это займёт мгновение.</CardDescription>
        </CardHeader>
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

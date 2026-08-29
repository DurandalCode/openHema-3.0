"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConfirmEmailChange } from "@/features/profile/api/use-confirm-email-change";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

type ScreenState = "pending" | "success" | "invalid";

/**
 * EmailChangeConfirmScreen — экран страницы
 * `/email-change/confirm?token=...` (спека 0042, FR-6). Тот же приём, что
 * `VerifyEmailScreen`: RPC дёргается сразу при монтировании, без формы
 * ввода.
 *
 * Отказ (просрочена/погашена/адрес занят другой учёткой к моменту
 * перехода, FR-8) — сервер не различает причину в публичном ответе
 * (NFR-2), поэтому экран показывает единый текст, упоминающий все три
 * причины разом, а не общее «ссылка недействительна».
 */
export function EmailChangeConfirmScreen({ token }: { token: string }) {
  const [state, setState] = useState<ScreenState>(token ? "pending" : "invalid");
  const confirmChange = useConfirmEmailChange();
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    confirmChange.mutate(token, {
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
            <CardTitle>Адрес изменён</CardTitle>
            <CardDescription>Новый адрес привязан к учётке.</CardDescription>
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
            <CardTitle>Ссылка недействительна, устарела, или адрес уже занят</CardTitle>
            <CardDescription>
              Запросите смену адреса заново в кабинете.
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
          <CardTitle>Подтверждаем новый адрес…</CardTitle>
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

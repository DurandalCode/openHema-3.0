"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { useSessionExpiredStore } from "@/shared/lib/session-expired-store";
import { useAuthDialogStore } from "@/features/auth/model/auth-dialog-store";
import { hasAnyDraft } from "@/features/my-applications/model/apply-draft";
import { SESSION_EXPIRED_COOKIE } from "@/shared/config/session-cookies";
import { isProtectedRoute } from "@/shared/config/protected-routes";

function readSessionExpiredCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    .some((c) => c === `${SESSION_EXPIRED_COOKIE}=1` || c.startsWith(`${SESSION_EXPIRED_COOKIE}=`));
}

function clearSessionExpiredCookie(): void {
  document.cookie = `${SESSION_EXPIRED_COOKIE}=; Max-Age=0; path=/`;
}

/**
 * SessionExpiredDialog — «Сессия истекла» (спека 0038, FR-15..FR-17).
 * Поднимается двумя путями: меткой-cookie от `middleware.ts` (продление не
 * удалось при переходе между страницами) и `UnauthorizedError` от
 * клиентского запроса (перехвачен `QueryCache.onError`/`MutationCache.onError`,
 * см. `shared/lib/query-client.ts`) — оба сходятся в `useSessionExpiredStore`.
 *
 * Монтируется один раз в корневом layout (как `AuthDialog`) и НЕ
 * перемонтируется при клиентской (soft) навигации — App Router переиспользует
 * layout. Middleware при этом может выставить метку на любой такой
 * навигации, не только на первой загрузке страницы, поэтому проверка cookie
 * идёт по `pathname` в зависимостях эффекта, а не один раз на монтирование —
 * иначе метка, выставленная после первого перехода, никогда бы не
 * подхватилась.
 */
export function SessionExpiredDialog() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const isOpen = useSessionExpiredStore((s) => s.isOpen);
  const open = useSessionExpiredStore((s) => s.open);
  const close = useSessionExpiredStore((s) => s.close);
  const openAuth = useAuthDialogStore((s) => s.open);

  useEffect(() => {
    if (readSessionExpiredCookie()) {
      clearSessionExpiredCookie();
      open("cookie");
    }
  }, [pathname, open]);

  const protectedRoute = isProtectedRoute(pathname);
  const showDraftNote = protectedRoute && hasAnyDraft();

  function handleLogin() {
    close();
    openAuth("login", pathname);
  }

  function handleSecondary() {
    close();
    if (protectedRoute) {
      router.push("/");
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Сессия истекла</DialogTitle>
          <DialogDescription>
            Пожалуйста, войдите снова, чтобы продолжить.
            {showDraftNote && " Черновик заявки сохранён — вернём его после входа."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleSecondary}>
            {protectedRoute ? "На главную" : "Продолжить как гость"}
          </Button>
          <Button onClick={handleLogin}>Войти снова</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

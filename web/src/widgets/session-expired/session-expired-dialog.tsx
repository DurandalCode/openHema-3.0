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

const SESSION_EXPIRED_COOKIE = "hema_session_expired";

// Защищённые страницы, недоступные гостю (спека 0038, FR-17): выход из
// диалога на них уводит на главную, а не оставляет на месте.
const PROTECTED_PREFIXES = ["/dashboard", "/applications"];
const NOMINATION_APPLY_RE = /^\/nominations\/[^/]+\/apply(\/|$)/;

function isProtectedRoute(pathname: string): boolean {
  if (PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  return NOMINATION_APPLY_RE.test(pathname);
}

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
 * удалось при переходе между страницами — читается и сразу гасится на
 * монтировании) и `UnauthorizedError` от клиентского запроса (перехвачен
 * `QueryCache.onError`, см. `shared/lib/query-client.ts`) — оба сходятся в
 * `useSessionExpiredStore`.
 *
 * Монтируется один раз в корневом layout (как `AuthDialog`).
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- один раз на монтирование
  }, []);

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

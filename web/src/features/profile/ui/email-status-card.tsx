"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Row } from "@/shared/ui/stack";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import type { CurrentUser } from "@/entities/user/lib/types";
import { useResendVerification } from "../api/use-resend-verification";
import { useCancelEmailChange } from "../api/use-cancel-email-change";
import { ChangeEmailDialog } from "./change-email-dialog";

/**
 * EmailStatusCard — статус адреса учётки в кабинете (спека 0042, FR-4/FR-6).
 * Три состояния, не взаимоисключающие: подтверждён/не подтверждён — про
 * текущий адрес; «ожидает подтверждения» — есть незавершённый запрос смены
 * (`pendingEmail`), может сочетаться с любым из первых двух.
 *
 * Троттлинг повторной отправки (FR-4, не чаще 1/мин) не дублируется
 * локальным таймером — единственный источник истины про троттлинг это
 * сервер: ошибка 429 просто показывается тостом (`useResendVerification` →
 * `mutation.error.message`), дешевле и надёжнее, чем вести собственный
 * отсчёт минуты в UI.
 */
export function EmailStatusCard({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const [changeOpen, setChangeOpen] = useState(false);
  const resend = useResendVerification();
  const cancelChange = useCancelEmailChange();

  function onResend() {
    resend.mutate(undefined, {
      onSuccess: () => toastSuccess("Письмо отправлено"),
      onError: (err) => toastError(err.message),
    });
  }

  function onCancelChange() {
    cancelChange.mutate(undefined, {
      onSuccess: () => {
        toastSuccess("Запрос смены адреса отменён");
        router.refresh();
      },
      onError: (err) => toastError(err.message),
    });
  }

  return (
    <div className="text-sm">
      <Row justify="between" align="center" gap={2}>
        <span className="text-muted-foreground">Адрес почты</span>
        {user.emailVerified ? (
          <Badge tone="success">подтверждён</Badge>
        ) : (
          <Badge tone="warn">не подтверждён</Badge>
        )}
      </Row>
      <p className="mt-1 truncate font-medium">{user.email}</p>

      {!user.emailVerified && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 w-full"
          loading={resend.isPending}
          onClick={onResend}
        >
          Отправить письмо снова
        </Button>
      )}

      {user.pendingEmail && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Ожидает подтверждения: <span className="font-medium text-foreground">{user.pendingEmail}</span>
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 h-auto p-0 text-xs text-destructive hover:text-destructive"
            loading={cancelChange.isPending}
            onClick={onCancelChange}
          >
            Отменить
          </Button>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 w-full"
        onClick={() => setChangeOpen(true)}
      >
        Сменить адрес
      </Button>

      <ChangeEmailDialog open={changeOpen} onOpenChange={setChangeOpen} />
    </div>
  );
}

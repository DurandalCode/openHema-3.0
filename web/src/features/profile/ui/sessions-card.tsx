"use client";

import { useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Row, Col } from "@/shared/ui/stack";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import { formatDateTime, formatRelativeTime } from "@/shared/lib/datetime";
import { useSessions } from "../api/use-sessions";
import { useRevokeSession } from "../api/use-revoke-session";
import { useRevokeOtherSessions } from "../api/use-revoke-other-sessions";

/**
 * SessionsCard — список активных refresh-сессий (спека 0042, FR-11/FR-12,
 * AC-6/AC-7). Без устройства/браузера/IP (решение 2 спеки) — только
 * времена, отформатированные `formatRelativeTime` (полная дата — в
 * `title`, как подсказка при наведении, тот же приём, что и в других
 * местах кабинета). Текущая сессия не получает кнопки «Завершить» — её
 * может завершить только «Выйти» (`LogoutButton`).
 */
export function SessionsCard() {
  const { data: sessions, isLoading } = useSessions();
  const revokeSession = useRevokeSession();
  const revokeOther = useRevokeOtherSessions();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function onRevoke(id: string) {
    revokeSession.mutate(id, {
      onSuccess: () => toastSuccess("Сессия завершена"),
      onError: (err) => toastError(err.message),
    });
  }

  function onRevokeOther() {
    revokeOther.mutate(undefined, {
      onSuccess: (count) =>
        toastSuccess(count > 0 ? `Завершено сессий: ${count}` : "Других активных сессий нет"),
      onError: (err) => toastError(err.message),
    });
  }

  const otherCount = (sessions ?? []).filter((s) => !s.current).length;

  return (
    <div className="text-sm">
      <p className="text-muted-foreground">Активные сессии</p>

      {isLoading && <p className="mt-2 text-muted-foreground">Загрузка…</p>}

      {!isLoading && sessions && sessions.length === 0 && (
        <p className="mt-2 text-muted-foreground">Нет активных сессий</p>
      )}

      {!isLoading && sessions && sessions.length > 0 && (
        <Col gap={2} className="mt-2">
          {sessions.map((s) => (
            <Row key={s.id} justify="between" align="center" gap={2} className="rounded-md border border-border px-3 py-2">
              <Col gap={1}>
                <Row gap={2} align="center">
                  {s.current && <Badge variant="secondary">эта сессия</Badge>}
                  <span title={formatDateTime(s.createdAt)}>создана {formatRelativeTime(s.createdAt)}</span>
                </Row>
                <span className="text-xs text-muted-foreground" title={formatDateTime(s.lastSeenAt)}>
                  активность {formatRelativeTime(s.lastSeenAt)}
                </span>
              </Col>
              {!s.current && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={revokeSession.isPending}
                  onClick={() => onRevoke(s.id)}
                >
                  Завершить
                </Button>
              )}
            </Row>
          ))}
        </Col>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 w-full"
        disabled={otherCount === 0}
        onClick={() => setConfirmOpen(true)}
      >
        Выйти со всех устройств
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Выйти со всех устройств?"
        consequences="Все ваши сессии, кроме текущей, будут завершены немедленно — на других устройствах потребуется войти заново."
        confirmLabel="Выйти со всех устройств"
        destructive
        onConfirm={onRevokeOther}
      />
    </div>
  );
}

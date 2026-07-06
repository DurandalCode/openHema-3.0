"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { useAdmins } from "../api/use-admins";
import { useUsers } from "../api/use-users";
import { usePromoteUser } from "../api/use-promote-user";
import { useDemoteUser } from "../api/use-demote-user";

/** AdminList — клиентский дашборд: админы + все пользователи с actions. */
export function AdminList({ currentUserId }: { currentUserId: string }) {
  const admins = useAdmins();
  const users = useUsers();
  const promote = usePromoteUser();
  const demote = useDemoteUser();

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Администраторы</CardTitle>
          <CardDescription>
            Пользователи с ролью ADMIN. Всего: {admins.data?.length ?? 0}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {admins.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {admins.error && (
            <Alert variant="destructive">
              <AlertDescription>{admins.error.message}</AlertDescription>
            </Alert>
          )}
          {admins.data?.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{a.email}</div>
                <div className="text-muted-foreground">
                  {a.displayName || "—"}
                </div>
              </div>
              {a.id !== currentUserId && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={demote.isPending}
                  onClick={() => demote.mutate(a.id)}
                >
                  Понизить
                </Button>
              )}
            </div>
          ))}
          {demote.error && (
            <Alert variant="destructive">
              <AlertDescription>{demote.error.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Все пользователи</CardTitle>
          <CardDescription>
            Можно повысить любого до ADMIN. Всего: {users.data?.length ?? 0}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {users.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {users.error && (
            <Alert variant="destructive">
              <AlertDescription>{users.error.message}</AlertDescription>
            </Alert>
          )}
          {users.data?.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{u.email}</div>
                <div className="text-muted-foreground">
                  {u.displayName || "—"} · {u.role}
                </div>
              </div>
              {u.role === "ROLE_USER" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={promote.isPending}
                  onClick={() => promote.mutate(u.id)}
                >
                  Повысить
                </Button>
              )}
            </div>
          ))}
          {promote.error && (
            <Alert variant="destructive">
              <AlertDescription>{promote.error.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

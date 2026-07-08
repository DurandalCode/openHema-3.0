"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Skeleton } from "@/shared/ui/skeleton";
import { Col } from "@/shared/ui/stack";
import { useAdmins } from "../api/use-admins";
import { useUsers } from "../api/use-users";
import { usePromoteUser } from "../api/use-promote-user";
import { useDemoteUser } from "../api/use-demote-user";
import { UserRow } from "./user-row";

/** RowsSkeleton — единый плейсхолдер загрузки списка (заменяет разнородный текст). */
function RowsSkeleton() {
  return (
    <Col gap={2}>
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </Col>
  );
}

/** AdminList — клиентский дашборд: админы + все пользователи с actions. */
export function AdminList({ currentUserId }: { currentUserId: string }) {
  const admins = useAdmins();
  const users = useUsers();
  const promote = usePromoteUser();
  const demote = useDemoteUser();

  return (
    <Col gap={6}>
      <Card>
        <CardHeader>
          <CardTitle>Администраторы</CardTitle>
          <CardDescription>
            Пользователи с ролью ADMIN. Всего: {admins.data?.length ?? 0}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Col gap={2}>
            {admins.isLoading && <RowsSkeleton />}
            {admins.error && (
              <Alert variant="destructive">
                <AlertDescription>{admins.error.message}</AlertDescription>
              </Alert>
            )}
            {admins.data?.map((a) => (
              <UserRow
                key={a.id}
                user={a}
                action={
                  a.id !== currentUserId
                    ? {
                        label: "Понизить",
                        disabled: demote.isPending,
                        onClick: () => demote.mutate(a.id),
                      }
                    : undefined
                }
              />
            ))}
            {demote.error && (
              <Alert variant="destructive">
                <AlertDescription>{demote.error.message}</AlertDescription>
              </Alert>
            )}
          </Col>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Все пользователи</CardTitle>
          <CardDescription>
            Можно повысить любого до ADMIN. Всего: {users.data?.length ?? 0}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Col gap={2}>
            {users.isLoading && <RowsSkeleton />}
            {users.error && (
              <Alert variant="destructive">
                <AlertDescription>{users.error.message}</AlertDescription>
              </Alert>
            )}
            {users.data?.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                action={
                  u.role === "ROLE_USER"
                    ? {
                        label: "Повысить",
                        disabled: promote.isPending,
                        onClick: () => promote.mutate(u.id),
                      }
                    : undefined
                }
              />
            ))}
            {promote.error && (
              <Alert variant="destructive">
                <AlertDescription>{promote.error.message}</AlertDescription>
              </Alert>
            )}
          </Col>
        </CardContent>
      </Card>
    </Col>
  );
}

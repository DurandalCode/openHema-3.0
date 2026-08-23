"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Col, Row } from "@/shared/ui/stack";
import { EditProfileDialog } from "@/features/profile/ui/edit-profile-dialog";
import type { CurrentUser } from "@/entities/user/lib/types";

const ROLE_LABEL: Record<CurrentUser["role"], string> = {
  ROLE_UNSPECIFIED: "—",
  ROLE_USER: "Пользователь",
  ROLE_ADMIN: "Администратор",
};

/** ProfileRow — единая строка «label — value» карточки профиля. */
function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <Row justify="between" gap={4}>
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </Row>
  );
}

/**
 * ProfileCard — карточка профиля кабинета (спека 0038, FR-22/FR-23):
 * данные + кнопка «Изменить данные», открывающая `EditProfileDialog`.
 */
export function ProfileCard({ user }: { user: CurrentUser }) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Профиль</CardTitle>
        <CardDescription>Данные вашего аккаунта.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        <Col gap={3}>
          <ProfileRow label="Email" value={user.email} />
          <ProfileRow label="Имя" value={user.displayName || "—"} />
          <ProfileRow label="Клуб" value={user.club || "—"} />
          <ProfileRow label="Роль" value={ROLE_LABEL[user.role]} />
          <ProfileRow
            label="Регистрация"
            value={
              user.createdAt
                ? new Date(user.createdAt).toLocaleDateString("ru-RU")
                : "—"
            }
          />
        </Col>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 w-full"
          onClick={() => setEditOpen(true)}
        >
          Изменить данные
        </Button>
      </CardContent>
      <EditProfileDialog user={user} open={editOpen} onOpenChange={setEditOpen} />
    </Card>
  );
}

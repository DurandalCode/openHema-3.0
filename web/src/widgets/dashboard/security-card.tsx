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
import { Separator } from "@/shared/ui/separator";
import { Col } from "@/shared/ui/stack";
import { ChangePasswordDialog } from "@/features/profile/ui/change-password-dialog";
import { EmailStatusCard } from "@/features/profile/ui/email-status-card";
import { SessionsCard } from "@/features/profile/ui/sessions-card";
import type { CurrentUser } from "@/entities/user/lib/types";

/**
 * SecurityCard — блок «Безопасность» кабинета (спека 0038, FR-24..FR-26;
 * спека 0042, FR-4/FR-6/FR-11/FR-12): смена пароля, статус адреса почты и
 * реестр активных сессий.
 */
export function SecurityCard({ user }: { user: CurrentUser }) {
  const [changeOpen, setChangeOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Безопасность</CardTitle>
        <CardDescription>Пароль, адрес почты и активные сессии.</CardDescription>
      </CardHeader>
      <CardContent>
        <Col gap={4}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setChangeOpen(true)}
          >
            Сменить пароль
          </Button>

          <Separator />

          <EmailStatusCard user={user} />

          <Separator />

          <SessionsCard />
        </Col>
      </CardContent>
      <ChangePasswordDialog open={changeOpen} onOpenChange={setChangeOpen} />
    </Card>
  );
}

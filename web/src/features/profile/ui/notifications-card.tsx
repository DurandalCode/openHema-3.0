"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Checkbox } from "@/shared/ui/checkbox";
import { Label } from "@/shared/ui/label";
import { Col, Row } from "@/shared/ui/stack";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import type { CurrentUser, NotificationSettings } from "@/entities/user/lib/types";
import { useUpdateNotifications } from "../api/use-update-notifications";

const EXPLANATION_UNVERIFIED =
  "Доступно после подтверждения адреса почты — на неподтверждённый адрес письма не уходят.";

/**
 * NotificationsCard — личные переключатели уведомлений (спека 0042,
 * FR-20/FR-21, AC-14). Выключены по умолчанию (FR-20). Заблокированы с
 * объяснением, если адрес не подтверждён — включение при
 * неподтверждённом адресе отклоняется и сервером (409), но UI не даёт
 * дойти до этого отказа: переключатель недоступен сразу, а не после
 * ошибки.
 *
 * Глобальный переключатель организатора (FR-22) — вне видимости этой
 * карточки: спека 0042 требует показывать «рассылка приостановлена
 * организатором», но соответствующее глобальное состояние отдаёт профиль
 * турнира (`entities/tournament`, трек G), не `CurrentUser`. Здесь —
 * только личный уровень; сообщение о глобальном запрете добавляется
 * туда, где экран уже видит оба уровня.
 */
export function NotificationsCard({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const update = useUpdateNotifications();
  const disabled = !user.emailVerified;

  function onToggle(field: keyof NotificationSettings, checked: boolean) {
    if (disabled) return;
    const next: NotificationSettings = { ...user.notifications, [field]: checked };
    update.mutate(next, {
      onSuccess: () => {
        toastSuccess("Настройки уведомлений сохранены");
        router.refresh();
      },
      onError: (err) => toastError(err.message),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Уведомления</CardTitle>
        <CardDescription>
          Письма о ваших заявках и боях. По умолчанию выключены.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Col gap={3}>
          <Row align="center" gap={2}>
            <Checkbox
              id="notify-application-state"
              checked={user.notifications.applicationState}
              disabled={disabled || update.isPending}
              onCheckedChange={(checked) => onToggle("applicationState", checked === true)}
            />
            <Label htmlFor="notify-application-state" className="font-normal">
              О состоянии моих заявок
            </Label>
          </Row>
          <Row align="center" gap={2}>
            <Checkbox
              id="notify-pool-seated"
              checked={user.notifications.poolSeated}
              disabled={disabled || update.isPending}
              onCheckedChange={(checked) => onToggle("poolSeated", checked === true)}
            />
            <Label htmlFor="notify-pool-seated" className="font-normal">
              О постановке моего пула на площадку
            </Label>
          </Row>
          {disabled && (
            <p className="text-xs text-muted-foreground">{EXPLANATION_UNVERIFIED}</p>
          )}
        </Col>
      </CardContent>
    </Card>
  );
}

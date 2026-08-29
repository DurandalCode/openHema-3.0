"use client";

import { Checkbox } from "@/shared/ui/checkbox";
import { Label } from "@/shared/ui/label";
import { Col, Row } from "@/shared/ui/stack";
import type { NotificationSettings } from "@/entities/tournament/lib/types";

export type NotificationsSectionProps = {
  value: NotificationSettings;
  onChange: (value: NotificationSettings) => void;
};

/**
 * NotificationsSection — глобальные переключатели уведомлений турнира
 * (спека 0042, T40, FR-19/FR-22): по одному на вид, оба выключены по
 * умолчанию (полный выключенный турнир не рассылает ничего, пока admin явно
 * не разрешит вид). Контролируемое поле, как остальная форма — своей
 * мутации нет, сохраняется вместе со всем профилем по «Сохранить»
 * (`TournamentScreen`/`draftToUpdateInput`), в отличие от `file-or-link-
 * field.tsx`, у которого своя мутация на каждое действие.
 *
 * В проекте нет отдельного компонента `Switch` — используется тот же
 * `Checkbox`, что и остальные булевы поля формы (см.
 * `create-fighter-dialog.tsx`), чтобы не заводить второй визуальный язык
 * ради одного раздела.
 */
export function NotificationsSection({ value, onChange }: NotificationsSectionProps) {
  function set(key: keyof NotificationSettings, checked: boolean) {
    onChange({ ...value, [key]: checked });
  }

  return (
    <Col gap={3}>
      <Label>Уведомления</Label>

      <Col gap={1}>
        <Row align="center" gap={2}>
          <Checkbox
            id="notif-application-state"
            checked={value.applicationState}
            onCheckedChange={(checked) => set("applicationState", checked === true)}
          />
          <Label htmlFor="notif-application-state" className="font-normal normal-case">
            Уведомлять о состоянии заявок
          </Label>
        </Row>
        <p className="text-xs text-muted-foreground">
          Письмо уходит только тем, кто лично включил этот вид у себя.
        </p>
      </Col>

      <Col gap={1}>
        <Row align="center" gap={2}>
          <Checkbox
            id="notif-pool-seated"
            checked={value.poolSeated}
            onCheckedChange={(checked) => set("poolSeated", checked === true)}
          />
          <Label htmlFor="notif-pool-seated" className="font-normal normal-case">
            Уведомлять о постановке пула на площадку
          </Label>
        </Row>
        <p className="text-xs text-muted-foreground">
          Письмо уходит только тем, кто лично включил этот вид у себя.
        </p>
      </Col>
    </Col>
  );
}

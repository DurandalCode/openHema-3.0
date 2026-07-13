"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Col } from "@/shared/ui/stack";
import { useSubmitApplication } from "../api/use-submit-application";

/**
 * SubmitApplicationButton — форма подачи заявки на публичной странице
 * номинации: клуб и признак экипировки (спека 0006, FR-1) + кнопка «Подать
 * заявку». Видна только аутентифицированному пользователю (гейтинг — на
 * уровне вызывающего виджета, FR-1/FR-11).
 */
export function SubmitApplicationButton({ nominationId }: { nominationId: string }) {
  const submit = useSubmitApplication();
  const [done, setDone] = useState(false);
  const [club, setClub] = useState("");
  const [needsEquipment, setNeedsEquipment] = useState(false);

  if (done) {
    return <p className="text-sm text-muted-foreground">Заявка подана</p>;
  }

  return (
    <Col gap={2} className="max-w-xs">
      <Input
        placeholder="Клуб (необязательно)"
        value={club}
        onChange={(e) => setClub(e.target.value)}
      />
      <Label className="flex items-center gap-2 font-normal">
        <Checkbox
          checked={needsEquipment}
          onCheckedChange={(checked) => setNeedsEquipment(checked === true)}
        />
        Нужна экипировка
      </Label>
      <Button
        type="button"
        size="sm"
        loading={submit.isPending}
        onClick={() =>
          submit.mutate(
            { nominationId, club, needsEquipment },
            { onSuccess: () => setDone(true) },
          )
        }
      >
        Подать заявку
      </Button>
      {submit.error && (
        <p className="mt-1 text-xs text-destructive">{submit.error.message}</p>
      )}
    </Col>
  );
}

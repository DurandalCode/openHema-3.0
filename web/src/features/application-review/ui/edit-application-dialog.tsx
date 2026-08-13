"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Col } from "@/shared/ui/stack";
import { stateLabel } from "@/entities/application/lib/state";
import type { Application, ApplicationState } from "@/entities/application/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { useEditApplication } from "../api/use-edit-application";

const STATE_OPTIONS: ApplicationState[] = [
  "APPLICATION_STATE_SUBMITTED",
  "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION",
  "APPLICATION_STATE_PAID",
  "APPLICATION_STATE_REGISTERED",
  "APPLICATION_STATE_WITHDRAWN",
];

/**
 * EditApplicationDialog — правка заявки админом: клуб, признак экипировки,
 * переопределение отображаемого имени, перенос в другую номинацию и ручная
 * смена статуса (спека 0006, FR-3..FR-9). Допустимо над заявкой в любом
 * состоянии, включая терминальные (FR-9) — инструмент чистки данных и
 * разбора ошибок, а не пользовательский флоу.
 *
 * Контролируемый диалог (spec 0025, FR-22): без собственного триггера —
 * открывается извне (`ApplicationCardDialog`, поверх карточки заявки, как
 * вложенный Radix `Dialog`); открытость и обработчик закрытия — пропами
 * `open`/`onOpenChange`. Отдельной кнопки правки в строке таблицы больше
 * нет — правка живёт там же, где история заявки.
 *
 * nominationId/state отправляются на сервер только когда реально изменены —
 * так «ничего не менял» не читается бэкендом как перенос/смена статуса
 * (см. `EditApplicationRequest`, спека 0006, plan.md).
 */
export function EditApplicationDialog({
  open,
  onOpenChange,
  application,
  nominations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: Application;
  nominations: Nomination[];
}) {
  const [club, setClub] = useState(application.club);
  const [needsEquipment, setNeedsEquipment] = useState(application.needsEquipment);
  const [nameOverride, setNameOverride] = useState(application.applicantDisplayName);
  const [nominationId, setNominationId] = useState(application.nominationId);
  const [state, setState] = useState<ApplicationState>(application.state);
  const edit = useEditApplication();

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) {
      // Пересинхронизировать форму с актуальными значениями заявки при
      // каждом открытии — иначе повторное открытие покажет устаревший ввод.
      setClub(application.club);
      setNeedsEquipment(application.needsEquipment);
      setNameOverride(application.applicantDisplayName);
      setNominationId(application.nominationId);
      setState(application.state);
      edit.reset();
    }
  }

  function onSubmit() {
    edit.mutate(
      {
        applicationId: application.id,
        club,
        needsEquipment,
        applicantNameOverride: nameOverride,
        nominationId: nominationId !== application.nominationId ? nominationId : undefined,
        state: state !== application.state ? state : undefined,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Правка заявки</DialogTitle>
          <DialogDescription>
            Исправление данных, перенос в другую номинацию и ручная смена статуса — для
            чистки опечаток и разбора ошибок.
          </DialogDescription>
        </DialogHeader>
        <Col gap={4}>
          <Col gap={1}>
            <Label htmlFor="edit-application-club">Клуб</Label>
            <Input
              id="edit-application-club"
              value={club}
              onChange={(e) => setClub(e.target.value)}
            />
          </Col>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={needsEquipment}
              onCheckedChange={(checked) => setNeedsEquipment(checked === true)}
            />
            Нужна экипировка
          </Label>
          <Col gap={1}>
            <Label htmlFor="edit-application-name">Имя заявителя</Label>
            <Input
              id="edit-application-name"
              value={nameOverride}
              onChange={(e) => setNameOverride(e.target.value)}
            />
          </Col>
          {nominations.length > 0 && (
            <Col gap={1}>
              <Label>Номинация</Label>
              <Select value={nominationId} onValueChange={setNominationId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {nominations.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Col>
          )}
          <Col gap={1}>
            <Label>Статус</Label>
            <Select value={state} onValueChange={(v) => setState(v as ApplicationState)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {stateLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Col>
          {edit.error && (
            <Alert variant="destructive">
              <AlertDescription>{edit.error.message}</AlertDescription>
            </Alert>
          )}
        </Col>
        <DialogFooter>
          <Button type="button" loading={edit.isPending} onClick={onSubmit}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

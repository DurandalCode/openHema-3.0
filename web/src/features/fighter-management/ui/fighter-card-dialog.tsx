"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Col, Row } from "@/shared/ui/stack";
import { Tag } from "@/shared/ui/tag";
import { formatDateTime } from "@/shared/lib/datetime";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import {
  fighterStatusLabel,
  originLabel,
  participationLabel,
  withdrawalReasonLabel,
} from "@/entities/fighter/lib/labels";
import { hasLinkedAccount, type Fighter, type WithdrawalReason } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import {
  useAddToNomination,
  useEditFighter,
  useRemoveFromNomination,
  useReturnFighter,
  useWithdrawFighter,
} from "../api/use-fighter-mutations";
import { resolveReturnSeeding } from "../api/return-outcome";
import { addableNominations } from "../lib/select-fighters";
import { MoveFighterDialog } from "./move-fighter-dialog";

const REASON_OPTIONS: { value: WithdrawalReason; label: string }[] = [
  { value: "WITHDRAWAL_REASON_INJURY", label: "Травма" },
  { value: "WITHDRAWAL_REASON_BAN", label: "Бан" },
  { value: "WITHDRAWAL_REASON_OTHER", label: "Иное" },
];

const WITHDRAW_CONSEQUENCES =
  "Боец будет убран из всех групп, в которые уже распределён. Возврат на турнир не восстановит прежнее место — боец окажется в «нераспределённых».";
const REMOVE_CONSEQUENCES =
  "Боец будет убран из группы этой номинации, если уже распределён. Возврат участия не восстановит прежнее место — боец окажется в «нераспределённых».";

/**
 * FighterCardDialog — карточка бойца (spec FR-12..FR-21): перенос
 * `UiFighterCard` (ADR 0015, п.5) на `Dialog`. Единственное рабочее место
 * для правки имени/клуба (FR-13), управления участиями (снять/перевести/
 * вернуть, FR-14/FR-15 — первый вызов `MoveFighterDialog`/`useMoveFighter`,
 * plan «Обзор решения») и вывода/возврата с турнира (FR-18/FR-19).
 *
 * Читает бойца из уже загруженного `fighters` (ростер, `useRoster` у
 * вызывающей стороны) по `fighterId` — действия остаются открытой карточкой
 * и отражают обновлённое состояние бесплатно, через инвалидацию (FR-16). Если
 * боец исчезает из `fighters` (чужая правка, смена турнира), карточка
 * закрывается сама (plan «Риски»), а не показывает пустоту.
 */
export function FighterCardDialog({
  fighterId,
  fighters,
  nominations,
  open,
  onOpenChange,
}: {
  fighterId: string;
  fighters: Fighter[];
  nominations: Nomination[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fighter = fighters.find((f) => f.id === fighterId);

  useEffect(() => {
    if (open && !fighter) onOpenChange(false);
  }, [open, fighter, onOpenChange]);

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [clubDraft, setClubDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [reason, setReason] = useState<WithdrawalReason | "">("");
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  const [removeConfirmNominationId, setRemoveConfirmNominationId] = useState<string | null>(null);
  const [moveNominationId, setMoveNominationId] = useState<string | null>(null);
  const [addNominationId, setAddNominationId] = useState("");

  const editFighter = useEditFighter();
  const withdrawFighter = useWithdrawFighter();
  const returnFighter = useReturnFighter();
  const addToNomination = useAddToNomination();
  const removeFromNomination = useRemoveFromNomination();

  if (!fighter) return null;
  // Переприсваиваем в новую константу: TS не сужает `fighter` внутри
  // замыканий ниже (function-декларации не считаются немедленно вызванными).
  const currentFighter = fighter;

  const withdrawn = fighter.status === "FIGHTER_STATUS_WITHDRAWN";
  const currentReasonLabel = withdrawalReasonLabel(fighter.withdrawalReason);
  const nominationTitle = (id: string) => nominations.find((n) => n.id === id)?.title ?? id;
  const targets = addableNominations(fighter, nominations);

  function startEditing() {
    setNameDraft(currentFighter.name);
    setClubDraft(currentFighter.club);
    setNameError(null);
    setEditing(true);
  }

  function onSaveEdit() {
    if (!nameDraft.trim()) {
      setNameError("Введите имя");
      return;
    }
    editFighter.mutate(
      { fighterId: currentFighter.id, name: nameDraft, club: clubDraft },
      {
        onSuccess: () => {
          toastSuccess("Данные бойца обновлены");
          setEditing(false);
        },
        onError: (err) => toastError(err.message),
      },
    );
  }

  function onWithdrawConfirm() {
    if (!reason) return;
    withdrawFighter.mutate(
      { fighterId: currentFighter.id, reason },
      {
        onSuccess: () => {
          toastSuccess(`${currentFighter.name} выведен с турнира`);
          setReason("");
        },
        onError: (err) => toastError(err.message),
      },
    );
  }

  /**
   * onReturnFighter — возврат на турнир (spec FR-18/FR-19), тост уточняет
   * исход восстановления посева (спека 0040, FR-6): не новое поле ответа
   * `ReturnFighter`, а рефетч раскладок — `resolveReturnSeeding` смотрит,
   * оказался ли боец в `pools[i].members` (восстановлен) или в
   * `unassigned` (не восстановлен) — plan.md «Восстановление посева».
   */
  function onReturnFighter() {
    const activeNominationIds = currentFighter.participations
      .filter((p) => p.status === "PARTICIPATION_STATUS_ACTIVE")
      .map((p) => p.nominationId);

    returnFighter.mutate(currentFighter.id, {
      onSuccess: async () => {
        const outcome = await resolveReturnSeeding(currentFighter.id, activeNominationIds);
        if (outcome?.restored) {
          toastSuccess(`${currentFighter.name} возвращён в пул ${outcome.poolNumber}`);
        } else if (outcome && !outcome.restored) {
          toastSuccess(`${currentFighter.name} возвращён, посев не восстановлен — распределите вручную`);
        } else {
          toastSuccess(`${currentFighter.name} возвращён на турнир`);
        }
      },
      onError: (err) => toastError(err.message),
    });
  }

  function onRemoveConfirm() {
    if (!removeConfirmNominationId) return;
    const nominationId = removeConfirmNominationId;
    removeFromNomination.mutate(
      { fighterId: currentFighter.id, nominationId },
      {
        onSuccess: () => toastSuccess(`Снят с «${nominationTitle(nominationId)}»`),
        onError: (err) => toastError(err.message),
      },
    );
  }

  function onReturnParticipation(nominationId: string) {
    addToNomination.mutate(
      { fighterId: currentFighter.id, nominationId },
      {
        onSuccess: () => toastSuccess(`Возвращён в «${nominationTitle(nominationId)}»`),
        onError: (err) => toastError(err.message),
      },
    );
  }

  function onAddToNomination() {
    if (!addNominationId) return;
    const nominationId = addNominationId;
    addToNomination.mutate(
      { fighterId: currentFighter.id, nominationId },
      {
        onSuccess: () => {
          toastSuccess(`Добавлен в «${nominationTitle(nominationId)}»`);
          setAddNominationId("");
        },
        onError: (err) => toastError(err.message),
      },
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{fighter.name}</DialogTitle>
            <DialogDescription>{fighter.club || "—"}</DialogDescription>
          </DialogHeader>

          <Col gap={4}>
            <Row align="center" gap={2}>
              <span className="text-sm text-foreground">{originLabel(fighter.fromApplication)}</span>
              <span className="text-xs text-caption-foreground">{formatDateTime(fighter.createdAt)}</span>
              {/* Привязанная учётка (спека 0040, FR-8/AC-6) — только admin. */}
              {hasLinkedAccount(fighter) && (
                <Tag
                  label={
                    fighter.linkedAccountDisplayName
                      ? `Учётка: ${fighter.linkedAccountDisplayName}`
                      : "Привязана учётка"
                  }
                  tone="violet"
                />
              )}
            </Row>

            {editing ? (
              <Col gap={3}>
                <Col gap={1}>
                  <Label htmlFor="fighter-card-name">Имя</Label>
                  <Input
                    id="fighter-card-name"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    aria-invalid={nameError ? true : undefined}
                  />
                  {nameError && <p className="text-xs text-destructive">{nameError}</p>}
                </Col>
                <Col gap={1}>
                  <Label htmlFor="fighter-card-club">Клуб</Label>
                  <Input
                    id="fighter-card-club"
                    value={clubDraft}
                    onChange={(e) => setClubDraft(e.target.value)}
                  />
                </Col>
                <Row gap={2}>
                  <Button type="button" size="sm" loading={editFighter.isPending} onClick={onSaveEdit}>
                    Сохранить
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                    Отмена
                  </Button>
                </Row>
              </Col>
            ) : (
              <Row align="center" gap={3}>
                <span className="text-sm">
                  {fighterStatusLabel(fighter.status)}
                  {withdrawn && currentReasonLabel && (
                    <span className="text-caption-foreground"> · {currentReasonLabel}</span>
                  )}
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={startEditing}>
                  Править имя / клуб
                </Button>
              </Row>
            )}

            <Col gap={2}>
              <h3 className="text-sm font-medium">Участие в номинациях</h3>
              {fighter.participations.length === 0 && (
                <p className="text-sm text-caption-foreground">
                  Боец пока не участвует ни в одной номинации.
                </p>
              )}
              {fighter.participations.map((p) => (
                <Row key={p.nominationId} align="center" gap={2} wrap>
                  <span className="text-sm">{nominationTitle(p.nominationId)}</span>
                  <span className="text-xs text-caption-foreground">{participationLabel(p.status)}</span>
                  {p.status === "PARTICIPATION_STATUS_ACTIVE" ? (
                    <Row gap={2}>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setRemoveConfirmNominationId(p.nominationId)}
                      >
                        Снять
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setMoveNominationId(p.nominationId)}
                      >
                        Перевести
                      </Button>
                    </Row>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={addToNomination.isPending}
                      onClick={() => onReturnParticipation(p.nominationId)}
                    >
                      Вернуть
                    </Button>
                  )}
                </Row>
              ))}
            </Col>

            {targets.length > 0 && (
              <Row align="center" gap={2}>
                <Select value={addNominationId} onValueChange={setAddNominationId}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Добавить в номинацию" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!addNominationId || addToNomination.isPending}
                  onClick={onAddToNomination}
                >
                  Добавить
                </Button>
              </Row>
            )}

            <Row align="center" gap={2}>
              {withdrawn ? (
                <Button
                  type="button"
                  variant="outline"
                  loading={returnFighter.isPending}
                  onClick={onReturnFighter}
                >
                  Вернуть на турнир
                </Button>
              ) : (
                <>
                  <Select value={reason} onValueChange={(v) => setReason(v as WithdrawalReason)}>
                    <SelectTrigger aria-label="Причина вывода" className="w-40">
                      <SelectValue placeholder="Причина вывода" />
                    </SelectTrigger>
                    <SelectContent>
                      {REASON_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!reason}
                    loading={withdrawFighter.isPending}
                    onClick={() => setWithdrawConfirmOpen(true)}
                  >
                    Вывести с турнира
                  </Button>
                </>
              )}
            </Row>
          </Col>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={withdrawConfirmOpen}
        onOpenChange={setWithdrawConfirmOpen}
        title={`Вывести ${fighter.name} с турнира?`}
        consequences={WITHDRAW_CONSEQUENCES}
        confirmLabel="Да, вывести с турнира"
        destructive
        onConfirm={onWithdrawConfirm}
      />

      <ConfirmDialog
        open={removeConfirmNominationId !== null}
        onOpenChange={(next) => {
          if (!next) setRemoveConfirmNominationId(null);
        }}
        title={
          removeConfirmNominationId
            ? `Снять ${fighter.name} с «${nominationTitle(removeConfirmNominationId)}»?`
            : ""
        }
        consequences={REMOVE_CONSEQUENCES}
        confirmLabel="Да, снять"
        destructive
        onConfirm={onRemoveConfirm}
      />

      {moveNominationId && (
        <MoveFighterDialog
          fighter={fighter}
          fromNominationId={moveNominationId}
          nominations={nominations}
          open={moveNominationId !== null}
          onOpenChange={(next) => {
            if (!next) setMoveNominationId(null);
          }}
        />
      )}
    </>
  );
}

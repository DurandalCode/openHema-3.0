"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ClipboardList, Lock, LockOpen, Pencil, Trash2, Users, X } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Col, Row } from "@/shared/ui/stack";
import { useNominations } from "../api/use-nominations";
import { useCreateNomination } from "../api/use-create-nomination";
import { useUpdateNomination } from "../api/use-update-nomination";
import { useDeleteNomination } from "../api/use-delete-nomination";
import { useReorderNominations } from "../api/use-reorder-nominations";
import { usePoolLayoutStatus } from "../api/use-pool-layout-status";
import { useCloseRegistration } from "../api/use-close-registration";
import { useReopenRegistration } from "../api/use-reopen-registration";
import { canClose, canReopen } from "../api/registration-gate";
import type { NominationInput } from "../api/requests";
import type { Nomination, NominationStatus } from "@/entities/nomination/lib/types";
import { nominationStatusLabel } from "@/entities/nomination/lib/types";
import { poolLayoutStatusLabel } from "@/entities/pool/lib/types";

type FormState = {
  title: string;
  description: string;
  fighterCapacity: string;
  rulesUrl: string;
};

const EMPTY_FORM: FormState = { title: "", description: "", fighterCapacity: "", rulesUrl: "" };

function formToInput(form: FormState): NominationInput {
  return {
    title: form.title,
    description: form.description,
    fighterCapacity: form.fighterCapacity.trim() === "" ? null : Number(form.fighterCapacity),
    metadata: { rulesUrl: form.rulesUrl },
  };
}

/** NominationManagement — управление номинациями турнира в админке:
 * создание, редактирование, удаление, порядок (вверх/вниз). */
export function NominationManagement({ tournamentId }: { tournamentId: string }) {
  const { data: nominations = [], isLoading } = useNominations(tournamentId);
  const create = useCreateNomination(tournamentId);
  const reorder = useReorderNominations(tournamentId);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function onCreate(e: FormEvent) {
    e.preventDefault();
    create.mutate(formToInput(form), { onSuccess: () => setForm(EMPTY_FORM) });
  }

  function moveUp(index: number) {
    if (index === 0 || reorder.isPending) return;
    const ids = nominations.map((n) => n.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    reorder.mutate(ids);
  }

  function moveDown(index: number) {
    if (index === nominations.length - 1 || reorder.isPending) return;
    const ids = nominations.map((n) => n.id);
    [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
    reorder.mutate(ids);
  }

  const createError = create.error?.message ?? null;

  return (
    <Col gap={6}>
      <Card>
        <CardContent className="pt-6">
          <Col as="form" onSubmit={onCreate} gap={4}>
            <Col gap={2}>
              <Label htmlFor="nom-title">Название *</Label>
              <Input
                id="nom-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </Col>
            <Col gap={2}>
              <Label htmlFor="nom-description">Описание</Label>
              <Textarea
                id="nom-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </Col>
            <div className="grid gap-4 sm:grid-cols-2">
              <Col gap={2}>
                <Label htmlFor="nom-capacity">Кол-во бойцов</Label>
                <Input
                  id="nom-capacity"
                  type="number"
                  min={0}
                  placeholder="Не задано"
                  value={form.fighterCapacity}
                  onChange={(e) => setForm((f) => ({ ...f, fighterCapacity: e.target.value }))}
                />
              </Col>
              <Col gap={2}>
                <Label htmlFor="nom-rules">Ссылка на правила</Label>
                <Input
                  id="nom-rules"
                  type="url"
                  placeholder="https://example.com/rules"
                  value={form.rulesUrl}
                  onChange={(e) => setForm((f) => ({ ...f, rulesUrl: e.target.value }))}
                />
              </Col>
            </div>
            {createError && (
              <Alert variant="destructive">
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}
            <div>
              <Button type="submit" loading={create.isPending}>
                Добавить номинацию
              </Button>
            </div>
          </Col>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : nominations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Номинации ещё не добавлены.</p>
      ) : (
        <Col gap={3}>
          {nominations.map((n, i) => (
            <NominationRow
              key={n.id}
              tournamentId={tournamentId}
              nomination={n}
              isFirst={i === 0}
              isLast={i === nominations.length - 1}
              onMoveUp={() => moveUp(i)}
              onMoveDown={() => moveDown(i)}
              reorderPending={reorder.isPending}
            />
          ))}
        </Col>
      )}
    </Col>
  );
}

function NominationRow({
  tournamentId,
  nomination,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  reorderPending,
}: {
  tournamentId: string;
  nomination: Nomination;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  reorderPending: boolean;
}) {
  const update = useUpdateNomination(tournamentId);
  const del = useDeleteNomination(tournamentId);
  const poolStatus = usePoolLayoutStatus(nomination.id);
  const closeRegistration = useCloseRegistration(tournamentId);
  const reopenRegistration = useReopenRegistration(tournamentId);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>({
    title: nomination.title,
    description: nomination.description,
    fighterCapacity: nomination.fighterCapacity === null ? "" : String(nomination.fighterCapacity),
    rulesUrl: nomination.metadata.rulesUrl,
  });

  function onSave(e: FormEvent) {
    e.preventDefault();
    update.mutate(
      { id: nomination.id, input: formToInput(form) },
      { onSuccess: () => setEditing(false) },
    );
  }

  function onDelete() {
    del.mutate(nomination.id);
  }

  function onCloseRegistration() {
    closeRegistration.mutate(nomination.id);
  }

  function onReopenRegistration() {
    reopenRegistration.mutate(nomination.id);
  }

  const hasDistributedFighters = poolStatus.data?.hasDistributedFighters ?? false;

  const error =
    update.error?.message ??
    del.error?.message ??
    closeRegistration.error?.message ??
    reopenRegistration.error?.message ??
    null;

  if (editing) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Col as="form" onSubmit={onSave} gap={4}>
            <Col gap={2}>
              <Label htmlFor={`edit-title-${nomination.id}`}>Название *</Label>
              <Input
                id={`edit-title-${nomination.id}`}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </Col>
            <Col gap={2}>
              <Label htmlFor={`edit-description-${nomination.id}`}>Описание</Label>
              <Textarea
                id={`edit-description-${nomination.id}`}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </Col>
            <div className="grid gap-4 sm:grid-cols-2">
              <Col gap={2}>
                <Label htmlFor={`edit-capacity-${nomination.id}`}>Кол-во бойцов</Label>
                <Input
                  id={`edit-capacity-${nomination.id}`}
                  type="number"
                  min={0}
                  placeholder="Не задано"
                  value={form.fighterCapacity}
                  onChange={(e) => setForm((f) => ({ ...f, fighterCapacity: e.target.value }))}
                />
              </Col>
              <Col gap={2}>
                <Label htmlFor={`edit-rules-${nomination.id}`}>Ссылка на правила</Label>
                <Input
                  id={`edit-rules-${nomination.id}`}
                  type="url"
                  placeholder="https://example.com/rules"
                  value={form.rulesUrl}
                  onChange={(e) => setForm((f) => ({ ...f, rulesUrl: e.target.value }))}
                />
              </Col>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Row gap={2}>
              <Button type="submit" loading={update.isPending}>
                Сохранить
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                <X /> Отмена
              </Button>
            </Row>
          </Col>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Row align="start" justify="between" gap={4}>
          <Col gap={1} className="min-w-0">
            <span className="font-medium">{nomination.title}</span>
            {nomination.description && (
              <p className="text-sm text-muted-foreground">{nomination.description}</p>
            )}
            <Row gap={3} className="text-xs text-muted-foreground">
              <NominationStatusBadge status={nomination.status} />
              {poolStatus.data && (
                <PoolStatusBadge status={poolStatus.data.status} canUndo={poolStatus.data.canUndo} />
              )}
              {nomination.fighterCapacity !== null && (
                <span>Бойцов: {nomination.fighterCapacity}</span>
              )}
              {nomination.metadata.rulesUrl && (
                <a
                  href={nomination.metadata.rulesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Правила
                </a>
              )}
            </Row>
          </Col>
          <Row align="center" gap={1} className="shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={isFirst || reorderPending}
              onClick={onMoveUp}
              aria-label="Переместить выше"
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={isLast || reorderPending}
              onClick={onMoveDown}
              aria-label="Переместить ниже"
            >
              <ArrowDown />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" asChild aria-label="Заявки">
              <Link href={`/admin/applications?nominationId=${nomination.id}`}>
                <ClipboardList />
              </Link>
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" asChild aria-label="Пулы">
              <Link href={`/admin/nominations/${nomination.id}/pools`}>
                <Users />
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!canClose(nomination.status)}
              loading={closeRegistration.isPending}
              onClick={onCloseRegistration}
              aria-label="Закрыть приём"
              title="Закрыть приём"
            >
              <Lock />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!canReopen(nomination.status, hasDistributedFighters)}
              loading={reopenRegistration.isPending}
              onClick={onReopenRegistration}
              aria-label="Открыть приём"
              title="Открыть приём"
            >
              <LockOpen />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setEditing(true)}
              aria-label="Редактировать"
            >
              <Pencil />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              loading={del.isPending}
              onClick={onDelete}
              aria-label="Удалить"
            >
              <Trash2 />
            </Button>
          </Row>
        </Row>
        {error && !editing && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * NominationStatusBadge — бейдж статуса приёма заявок номинации (спека 0012,
 * FR-9): «приём заявок открыт» (default) / «приём заявок завершён»
 * (secondary). Причина закрытия (ручное/от раскладки) не различается на UI
 * (см. plan.md «Обзор решения») — только сам факт open/closed.
 */
function NominationStatusBadge({ status }: { status: NominationStatus }) {
  const variant: "default" | "secondary" = status === "NOMINATION_STATUS_OPEN" ? "default" : "secondary";
  return <Badge variant={variant}>{nominationStatusLabel(status)}</Badge>;
}

/**
 * PoolStatusBadge — бейдж статуса раскладки бойцов по пулам (спека 0009):
 * черновик / готово / ... Выбор variant по статусу; «готово» — outline
 * (менее яркий, чем default-primary); draft — secondary. Для active/finished
 * выходит за рамки текущей фичи, но показывается for completeness.
 *
 * `canUndo` вижу-как «есть отмена» — показывается только в draft (иначе noise),
 *через tooltip заголовка бейджа.
 */
function PoolStatusBadge({ status, canUndo }: { status: string; canUndo: boolean }) {
  const variant: "default" | "secondary" | "outline" =
    status === "POOL_LAYOUT_STATUS_READY"
      ? "default"
      : status === "POOL_LAYOUT_STATUS_DRAFT"
        ? "secondary"
        : "outline";
  const label = poolLayoutStatusLabel(status as Parameters<typeof poolLayoutStatusLabel>[0]);
  const undoHint = canUndo && status === "POOL_LAYOUT_STATUS_DRAFT" ? " (есть отмена)" : "";
  return (
    <Badge variant={variant} title={`Раскладка: ${label}${undoHint}`}>
      {label}
    </Badge>
  );
}

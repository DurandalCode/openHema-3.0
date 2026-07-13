"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Archive, ExternalLink, Pencil, RotateCcw, X } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Col, Row } from "@/shared/ui/stack";
import { useArenas } from "../api/use-arenas";
import { useCreateArena } from "../api/use-create-arena";
import { useUpdateArena } from "../api/use-update-arena";
import { useArchiveArena } from "../api/use-archive-arena";
import { useRestoreArena } from "../api/use-restore-arena";
import { useReorderArenas } from "../api/use-reorder-arenas";
import type { ArenaInput } from "../api/requests";
import type { Arena } from "@/entities/arena/lib/types";
import { arenaStatusLabel } from "@/entities/arena/lib/types";

type FormState = {
  name: string;
  description: string;
};

const EMPTY_FORM: FormState = { name: "", description: "" };

function formToInput(form: FormState): ArenaInput {
  return { name: form.name, description: form.description };
}

/** ArenaManagement — управление площадками турнира в админке: создание,
 * правка, архивация/возврат, порядок (вверх/вниз), ссылка на страницу
 * управления площадкой.
 *
 * Архивные площадки по умолчанию скрыты (soft-delete для UX = визуальный
 * hard-delete). Чекбокс «Показать архивные» включает их показ. Reorder
 * всегда оперирует полным набором id турнира (требование сервера —
 * ordered_ids = текущий набор); при скрытых архивных перемещение двух
 * видимых площадок выполняется перестановкой их id в полном массиве. */
export function ArenaManagement({ tournamentId }: { tournamentId: string }) {
  const { data: arenas = [], isLoading } = useArenas(tournamentId);
  const create = useCreateArena(tournamentId);
  const reorder = useReorderArenas(tournamentId);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showArchived, setShowArchived] = useState(false);

  const visibleArenas = showArchived
    ? arenas
    : arenas.filter((a) => a.status !== "ARENA_STATUS_ARCHIVED");
  const hasArchived = arenas.some((a) => a.status === "ARENA_STATUS_ARCHIVED");

  function onCreate(e: FormEvent) {
    e.preventDefault();
    create.mutate(formToInput(form), { onSuccess: () => setForm(EMPTY_FORM) });
  }

  function moveUp(index: number) {
    if (index === 0 || reorder.isPending) return;
    // Переставляем две соседние видимые площадки в полном массиве id:
    // backend требует ordered_ids = полный текущий набор (иначе
    // ErrInvalidInput). Архивные при скрытом чекбоксе остаются на своих
    // местах — их позиции в полном массиве не трогаем.
    const a = visibleArenas[index].id;
    const b = visibleArenas[index - 1].id;
    const ids = arenas.map((x) => x.id);
    const ia = ids.indexOf(a);
    const ib = ids.indexOf(b);
    [ids[ia], ids[ib]] = [ids[ib], ids[ia]];
    reorder.mutate(ids);
  }

  function moveDown(index: number) {
    if (index === visibleArenas.length - 1 || reorder.isPending) return;
    const a = visibleArenas[index].id;
    const b = visibleArenas[index + 1].id;
    const ids = arenas.map((x) => x.id);
    const ia = ids.indexOf(a);
    const ib = ids.indexOf(b);
    [ids[ia], ids[ib]] = [ids[ib], ids[ia]];
    reorder.mutate(ids);
  }

  const createError = create.error?.message ?? null;

  return (
    <Col gap={6}>
      <Card>
        <CardContent className="pt-6">
          <Col as="form" onSubmit={onCreate} gap={4}>
            <Col gap={2}>
              <Label htmlFor="arena-name">Название *</Label>
              <Input
                id="arena-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </Col>
            <Col gap={2}>
              <Label htmlFor="arena-description">Описание / локация</Label>
              <Textarea
                id="arena-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Например: у входа, ковёр 5×5"
              />
            </Col>
            {createError && (
              <Alert variant="destructive">
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}
            <div>
              <Button type="submit" loading={create.isPending}>
                Добавить площадку
              </Button>
            </div>
          </Col>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : visibleArenas.length === 0 ? (
        <>
          {hasArchived && !showArchived && (
            <Row align="center" gap={2} className="text-sm text-muted-foreground">
              <Checkbox
                id="show-archived"
                checked={showArchived}
                onCheckedChange={(v) => setShowArchived(v === true)}
              />
              <Label htmlFor="show-archived" className="font-normal cursor-pointer">
                Показать архивные площадки
              </Label>
            </Row>
          )}
          <p className="text-sm text-muted-foreground">
            {showArchived ? "Площадки ещё не добавлены." : "Активные площадки отсутствуют."}
          </p>
        </>
      ) : (
        <Col gap={3}>
          <Row align="center" gap={2} className="text-sm text-muted-foreground">
            <Checkbox
              id="show-archived"
              checked={showArchived}
              onCheckedChange={(v) => setShowArchived(v === true)}
            />
            <Label htmlFor="show-archived" className="font-normal cursor-pointer">
              Показать архивные площадки
            </Label>
          </Row>
          {visibleArenas.map((a, i) => (
            <ArenaRow
              key={a.id}
              tournamentId={tournamentId}
              arena={a}
              isFirst={i === 0}
              isLast={i === visibleArenas.length - 1}
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

function ArenaRow({
  tournamentId,
  arena,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  reorderPending,
}: {
  tournamentId: string;
  arena: Arena;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  reorderPending: boolean;
}) {
  const update = useUpdateArena(tournamentId);
  const archive = useArchiveArena(tournamentId);
  const restore = useRestoreArena(tournamentId);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: arena.name,
    description: arena.description,
  });

  const isArchived = arena.status === "ARENA_STATUS_ARCHIVED";

  function onSave(e: FormEvent) {
    e.preventDefault();
    update.mutate(
      { id: arena.id, input: formToInput(form) },
      { onSuccess: () => setEditing(false) },
    );
  }

  function onToggleArchive() {
    if (isArchived) {
      restore.mutate(arena.id);
    } else {
      archive.mutate(arena.id);
    }
  }

  const error =
    update.error?.message ?? archive.error?.message ?? restore.error?.message ?? null;

  if (editing) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Col as="form" onSubmit={onSave} gap={4}>
            <Col gap={2}>
              <Label htmlFor={`edit-name-${arena.id}`}>Название *</Label>
              <Input
                id={`edit-name-${arena.id}`}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </Col>
            <Col gap={2}>
              <Label htmlFor={`edit-description-${arena.id}`}>Описание / локация</Label>
              <Textarea
                id={`edit-description-${arena.id}`}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </Col>
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
            <Row align="center" gap={2}>
              <span className={isArchived ? "font-medium text-muted-foreground line-through" : "font-medium"}>
                {arena.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {arenaStatusLabel(arena.status)}
              </span>
            </Row>
            {arena.description && (
              <p className="text-sm text-muted-foreground">{arena.description}</p>
            )}
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
            <Button type="button" variant="ghost" size="icon-sm" asChild aria-label="Открыть площадку">
              <Link href={`/admin/arenas/${arena.id}`}>
                <ExternalLink />
              </Link>
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
              loading={archive.isPending || restore.isPending}
              onClick={onToggleArchive}
              aria-label={isArchived ? "Вернуть из архива" : "Убрать в архив"}
            >
              {isArchived ? <RotateCcw /> : <Archive />}
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
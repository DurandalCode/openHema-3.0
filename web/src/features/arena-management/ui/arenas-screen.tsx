"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Label } from "@/shared/ui/label";
import { PageHeader } from "@/shared/ui/page-header";
import { Col, Row } from "@/shared/ui/stack";
import { toastError, toastSuccess, toastUndo } from "@/shared/lib/toast";
import type { Arena } from "@/entities/arena/lib/types";
import { useArenas } from "../api/use-arenas";
import { useArenaBoards } from "../api/use-arena-boards";
import { useArchiveArena } from "../api/use-archive-arena";
import { useRestoreArena } from "../api/use-restore-arena";
import { useReorderArenas } from "../api/use-reorder-arenas";
import { ArenasTable } from "./arenas-table";
import { CreateArenaDialog } from "./create-arena-dialog";
import { EditArenaDialog } from "./edit-arena-dialog";

function countWord(n: number, forms: [string, string, string]): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  const mod10 = n % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function arenasCountWord(n: number): string {
  return countWord(n, ["площадка", "площадки", "площадок"]);
}

function occupiedCountWord(n: number): string {
  return countWord(n, ["занята", "заняты", "заняты"]);
}

/**
 * ArenasScreen — корень экрана «Площадки» (spec FR-1…FR-22): таблица с
 * порядком/живым статусом/действиями, модалки создания и правки, чекбокс
 * «Показать архивные». Владеет UI-состоянием (показ архивных, id
 * редактируемой площадки, открытость модалки создания) через `useState`
 * (ADR 0006). Заголовок раздела — `PageHeader` (spec FR-20, правило 0024
 * FR-19).
 *
 * Порядок площадок — `arenas` от сервера уже упорядочен по позиции
 * (0008); `moveArena` переставляет id только двух **соседних активных**
 * площадок внутри полного массива, не трогая позиции скрытых архивных
 * между ними (spec AC-12) — тот же приём, что был в снесённом
 * `arena-management.tsx`.
 */
export function ArenasScreen({
  tournamentId,
  tournamentName,
}: {
  tournamentId: string;
  tournamentName?: string | null;
}) {
  const arenasQuery = useArenas(tournamentId);
  const arenas = arenasQuery.data ?? [];
  const activeArenas = arenas.filter((a) => a.status !== "ARENA_STATUS_ARCHIVED");
  const boardStates = useArenaBoards(tournamentId, activeArenas);

  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingArenaId, setEditingArenaId] = useState<string | null>(null);

  const reorder = useReorderArenas(tournamentId);
  const archive = useArchiveArena(tournamentId);
  const restore = useRestoreArena(tournamentId);

  const archivedCount = arenas.length - activeArenas.length;
  const occupiedCount = activeArenas.filter((a) => {
    const state = boardStates.get(a.id);
    return state && !state.isError && state.status.kind !== "free" && state.status.kind !== "unknown";
  }).length;

  function moveArena(arenaId: string, direction: -1 | 1) {
    if (reorder.isPending) return;
    const activeIds = activeArenas.map((a) => a.id);
    const ai = activeIds.indexOf(arenaId);
    const bi = ai + direction;
    if (ai === -1 || bi < 0 || bi >= activeIds.length) return;
    const neighborId = activeIds[bi];

    const ids = arenas.map((a) => a.id);
    const ia = ids.indexOf(arenaId);
    const ib = ids.indexOf(neighborId);
    [ids[ia], ids[ib]] = [ids[ib], ids[ia]];
    reorder.mutate(ids);
  }

  function onArchive(arenaId: string) {
    archive.mutate(arenaId, {
      onSuccess: () => {
        toastUndo("Площадка убрана в архив", {
          onUndo: () =>
            restore.mutate(arenaId, {
              onError: (err: Error) => toastError(err.message),
            }),
        });
      },
      onError: (err: Error) => toastError(err.message),
    });
  }

  function onRestore(arenaId: string) {
    restore.mutate(arenaId, {
      onSuccess: () => toastSuccess("Площадка восстановлена"),
      onError: (err: Error) => toastError(err.message),
    });
  }

  const editingArena = editingArenaId ? (arenas.find((a) => a.id === editingArenaId) ?? null) : null;

  const crumb = tournamentName ? `ПЛОЩАДКИ · ${tournamentName.toUpperCase()}` : "ПЛОЩАДКИ";
  const meta = `${arenas.length} ${arenasCountWord(arenas.length)} · ${occupiedCount} ${occupiedCountWord(occupiedCount)}`;

  return (
    <div data-slot="arenas-screen" className="flex flex-col">
      <PageHeader
        crumb={crumb}
        title="Площадки"
        meta={meta}
        action={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            + Площадка
          </Button>
        }
      />

      <Col gap={6} className="p-4">
        <Row align="center" gap={2} className="text-sm text-muted-foreground">
          <span>Порядок площадок определяет их место во всех списках турнира</span>
          <Row align="center" gap={2} className="ml-auto">
            <Checkbox
              id="show-archived"
              checked={showArchived}
              onCheckedChange={(v) => setShowArchived(v === true)}
            />
            <Label htmlFor="show-archived" className="cursor-pointer font-normal">
              Показать архивные {archivedCount}
            </Label>
          </Row>
        </Row>

        <ArenasTable
          arenas={arenas}
          showArchived={showArchived}
          isLoading={arenasQuery.isLoading}
          error={arenasQuery.error}
          onRetry={() => arenasQuery.refetch()}
          boardStates={boardStates}
          reorderPending={reorder.isPending}
          archivePendingId={archive.isPending ? (archive.variables ?? null) : null}
          restorePendingId={restore.isPending ? (restore.variables ?? null) : null}
          onMoveUp={(id) => moveArena(id, -1)}
          onMoveDown={(id) => moveArena(id, 1)}
          onEdit={setEditingArenaId}
          onArchive={onArchive}
          onRestore={onRestore}
        />
      </Col>

      {editingArena && (
        <EditArenaDialog
          tournamentId={tournamentId}
          arena={editingArena}
          open={editingArenaId !== null}
          onOpenChange={(next) => {
            if (!next) setEditingArenaId(null);
          }}
          onArchive={() => onArchive(editingArena.id)}
          archivePending={archive.isPending && archive.variables === editingArena.id}
        />
      )}

      <CreateArenaDialog
        tournamentId={tournamentId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(arena: Arena) => toastSuccess(`«${arena.name}» добавлена`)}
      />
    </div>
  );
}

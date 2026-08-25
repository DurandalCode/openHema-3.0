"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { PageHeader } from "@/shared/ui/page-header";
import { Col, Row } from "@/shared/ui/stack";
import { toastError, toastSuccess, toastUndo } from "@/shared/lib/toast";
import { useNominations } from "../api/use-nominations";
import { useNominationSchemas } from "../api/use-nomination-schemas";
import { useCreateNomination } from "../api/use-create-nomination";
import { useReorderNominations } from "../api/use-reorder-nominations";
import { useDeleteNomination } from "../api/use-delete-nomination";
import { useCloseRegistration } from "../api/use-close-registration";
import { useReopenRegistration } from "../api/use-reopen-registration";
import { NominationsTable } from "./nominations-table";
import { CreateNominationDialog } from "./create-nomination-dialog";
import { EditNominationDialog } from "./edit-nomination-dialog";

function countWord(n: number, forms: [string, string, string]): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  const mod10 = n % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function nominationsCountWord(n: number): string {
  return countWord(n, ["номинация", "номинации", "номинаций"]);
}

// deleteGateMessage — переводит машиночитаемый код гейта на удаление
// номинации (спека 0040, FR-1/FR-2/AC-1/AC-2; BFF `app/api/nominations/
// [id]/route.ts`, `deleteErrorResponse`) в конкретную русскую причину. Код,
// не входящий в словарь (в т.ч. «not found» и сетевые ошибки), показывается
// как есть — BFF в этих случаях уже отдаёт разумный текст.
const DELETE_GATE_MESSAGES: Record<string, string> = {
  has_distributed_fighters: "В номинации есть распределённые бойцы",
  has_bouts: "В номинации есть бои",
};

function deleteGateMessage(error: string): string {
  return DELETE_GATE_MESSAGES[error] ?? error;
}

/**
 * NominationsScreen — корень экрана «Номинации» (spec FR-1…FR-20): таблица с
 * порядком/статусом приёма/сводкой схемы/действиями, модалки создания и
 * правки, `ConfirmDialog` удаления. Владеет UI-состоянием (id правимой/
 * удаляемой номинации, открытость модалки создания) через `useState`
 * (ADR 0006). Заголовок раздела — `PageHeader` (spec FR-18, правило 0024
 * FR-19).
 *
 * Порядок номинаций — `nominations` от сервера уже упорядочен по позиции
 * (0003); `moveNomination` переставляет id только двух **соседних** строк
 * (в отличие от 0027 — у номинации нет архива, поэтому индексы совпадают с
 * видимым порядком без дополнительной фильтрации).
 */
export function NominationsScreen({
  tournamentId,
  tournamentName,
}: {
  tournamentId: string;
  tournamentName?: string | null;
}) {
  const nominationsQuery = useNominations(tournamentId);
  const nominations = nominationsQuery.data ?? [];
  const schemas = useNominationSchemas(nominations.map((n) => n.id));

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reorder = useReorderNominations(tournamentId);
  const del = useDeleteNomination(tournamentId);
  const closeRegistration = useCloseRegistration(tournamentId);
  const reopenRegistration = useReopenRegistration(tournamentId);

  const openCount = nominations.filter((n) => n.status === "NOMINATION_STATUS_OPEN").length;

  function moveNomination(nominationId: string, direction: -1 | 1) {
    if (reorder.isPending) return;
    const ids = nominations.map((n) => n.id);
    const i = ids.indexOf(nominationId);
    const j = i + direction;
    if (i === -1 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  }

  function onCloseRegistration(nominationId: string) {
    closeRegistration.mutate(nominationId, {
      onSuccess: () => {
        toastUndo("Приём заявок закрыт", {
          onUndo: () =>
            reopenRegistration.mutate(nominationId, {
              onError: (err: Error) => toastError(err.message),
            }),
        });
      },
      onError: (err: Error) => toastError(err.message),
    });
  }

  function onReopenRegistration(nominationId: string) {
    reopenRegistration.mutate(nominationId, {
      onSuccess: () => toastSuccess("Приём заявок открыт"),
      onError: (err: Error) => toastError(err.message),
    });
  }

  function onConfirmDelete() {
    if (!deletingId) return;
    del.mutate(deletingId, {
      onSuccess: () => toastSuccess("Номинация удалена"),
      onError: (err: Error) => toastError(deleteGateMessage(err.message)),
    });
    setDeletingId(null);
  }

  const editingNomination = editingId ? (nominations.find((n) => n.id === editingId) ?? null) : null;
  const deletingNomination = deletingId ? (nominations.find((n) => n.id === deletingId) ?? null) : null;

  const crumb = tournamentName ? `НОМИНАЦИИ · ${tournamentName.toUpperCase()}` : "НОМИНАЦИИ";
  const meta = `${nominations.length} ${nominationsCountWord(nominations.length)} · ${openCount} с открытым приёмом`;

  return (
    <div data-slot="nominations-screen" className="flex flex-col">
      <PageHeader
        crumb={crumb}
        title="Номинации"
        meta={meta}
        action={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            + Номинация
          </Button>
        }
      />

      <Col gap={6} className="p-4">
        <Row align="center" gap={2} className="text-sm text-muted-foreground">
          <span>Порядок номинаций определяет их место во всех списках турнира</span>
        </Row>

        <NominationsTable
          nominations={nominations}
          isLoading={nominationsQuery.isLoading}
          error={nominationsQuery.error}
          onRetry={() => nominationsQuery.refetch()}
          schemas={schemas}
          reorderPending={reorder.isPending}
          closePendingId={closeRegistration.isPending ? (closeRegistration.variables ?? null) : null}
          reopenPendingId={reopenRegistration.isPending ? (reopenRegistration.variables ?? null) : null}
          onMoveUp={(id) => moveNomination(id, -1)}
          onMoveDown={(id) => moveNomination(id, 1)}
          onEdit={setEditingId}
          onDelete={setDeletingId}
          onCloseRegistration={onCloseRegistration}
          onReopenRegistration={onReopenRegistration}
        />
      </Col>

      {editingNomination && (
        <EditNominationDialog
          tournamentId={tournamentId}
          nomination={editingNomination}
          open={editingId !== null}
          onOpenChange={(next) => {
            if (!next) setEditingId(null);
          }}
        />
      )}

      <CreateNominationDialog
        tournamentId={tournamentId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(nomination) => toastSuccess(`«${nomination.title}» добавлена`)}
      />

      {deletingNomination && (
        <ConfirmDialog
          open={deletingId !== null}
          onOpenChange={(next) => {
            if (!next) setDeletingId(null);
          }}
          title={`Удалить номинацию «${deletingNomination.title}»?`}
          consequences="Действие необратимо: будут потеряны все заявки, схема этапов, составы групп, бои и результаты этой номинации."
          confirmLabel="Удалить"
          confirmWord={deletingNomination.title}
          destructive
          onConfirm={onConfirmDelete}
        />
      )}
    </div>
  );
}

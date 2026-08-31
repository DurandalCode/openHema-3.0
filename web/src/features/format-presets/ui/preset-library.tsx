"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";
import { SkeletonCards } from "@/shared/ui/skeletons";
import { Col, Row } from "@/shared/ui/stack";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import { UnauthorizedError } from "@/shared/api/unauthorized";
import { usePresets } from "../api/use-presets";
import { useDeletePreset } from "../api/use-delete-preset";
import { useRestoreBuiltinPresets } from "../api/use-restore-builtin-presets";
import { PresetCard } from "./preset-card";
import { RenamePresetDialog } from "./rename-preset-dialog";

function countWord(n: number, forms: [string, string, string]): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  const mod10 = n % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function presetsCountWord(n: number): string {
  return countWord(n, ["пресет", "пресета", "пресетов"]);
}

const NOMINATIONS_HREF = "/admin/nominations";

/**
 * PresetLibrary — корень экрана «Форматы» (спека 0029, FR-17…FR-23):
 * `PageHeader` со счётчиком (FR-17), пояснение, что такое пресет, и переход
 * к номинациям, где схему сохраняют как пресет (FR-18), карточки в
 * детерминированном порядке по имени (FR-20), модалка переименования и
 * `ConfirmDialog` удаления **без** `confirmWord` (FR-22 — пресет не уносит
 * данные турнира, схема восстановима из номинации, где применена), тосты
 * (FR-21/FR-22; удаление — без `toastUndo`, отмены у него нет). Заменяет
 * прежний вид с инлайн-правкой имени, инлайн-подтверждением удаления и
 * `Alert`-ами внутри карточек.
 */
export function PresetLibrary() {
  const { data: presets, isLoading, error, refetch } = usePresets();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const del = useDeletePreset();
  const restore = useRestoreBuiltinPresets();

  const sorted = useMemo(
    () => [...(presets ?? [])].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [presets],
  );

  const renamingPreset = renamingId ? (sorted.find((p) => p.id === renamingId) ?? null) : null;
  const deletingPreset = deletingId ? (sorted.find((p) => p.id === deletingId) ?? null) : null;

  function onConfirmDelete() {
    if (!deletingId) return;
    const name = deletingPreset?.name;
    del.mutate(deletingId, {
      onSuccess: () => toastSuccess(name ? `Пресет «${name}» удалён` : "Пресет удалён"),
      onError: (err: Error) => toastError(err.message),
    });
    setDeletingId(null);
  }

  const count = presets?.length ?? 0;

  function onRestoreBuiltinPresets() {
    restore.mutate(undefined, {
      onSuccess: ({ restored, skipped }) => {
        toastSuccess(
          restored.length === 0
            ? "Все встроенные пресеты уже в библиотеке"
            : `Восстановлено ${restored.length}, пропущено ${skipped}`,
        );
      },
      onError: (err: Error) => toastError(err.message),
    });
  }

  return (
    <div data-slot="preset-library" className="flex flex-col">
      <PageHeader
        crumb="ФОРМАТЫ · ВНЕ ТУРНИРА"
        title="Библиотека форматов"
        meta={`${count} ${presetsCountWord(count)}`}
      />

      <Col gap={6} className="p-4">
        <Row align="center" justify="between" gap={4} className="flex-wrap">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Пресет — это сохранённая схема номинации (этапы, правила отбора, размеры групп): она
            живёт вне турнира и переиспользуется между ними. Сохранить текущую схему как пресет
            можно на экране номинации.
          </p>
          <Row gap={2} className="flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRestoreBuiltinPresets}
            >
              Восстановить встроенные
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href={NOMINATIONS_HREF}>К номинациям</Link>
            </Button>
          </Row>
        </Row>

        {isLoading ? (
          <SkeletonCards count={3} />
        ) : error instanceof UnauthorizedError ? null : error || !presets ? (
          <Col gap={3} align="center" className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {error?.message ?? "Не удалось загрузить пресеты"}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Повторить
            </Button>
          </Col>
        ) : sorted.length === 0 ? (
          <EmptyState
            title="Пресетов ещё нет"
            hint="Соберите схему этапов на экране номинации и сохраните её как пресет — он появится здесь."
          >
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href={NOMINATIONS_HREF}>К номинациям</Link>
            </Button>
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                onRename={() => setRenamingId(preset.id)}
                onDelete={() => setDeletingId(preset.id)}
              />
            ))}
          </div>
        )}
      </Col>

      {renamingPreset && (
        <RenamePresetDialog
          preset={renamingPreset}
          open={renamingId !== null}
          onOpenChange={(next) => {
            if (!next) setRenamingId(null);
          }}
        />
      )}

      {deletingPreset && (
        <ConfirmDialog
          open={deletingId !== null}
          onOpenChange={(next) => {
            if (!next) setDeletingId(null);
          }}
          title={`Удалить пресет «${deletingPreset.name}»?`}
          consequences="Пресет исчезнет из библиотеки у всех организаторов. Номинации, к которым его уже применяли, не изменятся — схема давно скопирована в них по значению."
          confirmLabel="Удалить"
          destructive
          onConfirm={onConfirmDelete}
        />
      )}
    </div>
  );
}

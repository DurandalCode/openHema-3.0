"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Col, Row } from "@/shared/ui/stack";
import { formatPresetSummary } from "@/entities/stage/lib/labels";
import type { FormatPreset } from "@/entities/stage/lib/types";
import { usePresets } from "../api/use-presets";
import { useRenamePreset } from "../api/use-rename-preset";
import { useDeletePreset } from "../api/use-delete-preset";

/**
 * PresetLibrary — библиотека пресетов формата (спека 0020, FR-12): список
 * карточек с кратким описанием схемы (`formatPresetSummary`), переименование
 * и удаление. Библиотека рассчитана на десятки записей (NFR-3) — без
 * поиска/фильтров/пагинации.
 */
export function PresetLibrary() {
  const { data: presets, isLoading, error } = usePresets();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }
  if (error || !presets) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error?.message ?? "Не удалось загрузить пресеты"}</AlertDescription>
      </Alert>
    );
  }
  if (presets.length === 0) {
    return <p className="text-sm text-muted-foreground">Пресетов ещё нет.</p>;
  }

  return (
    <Col gap={3}>
      {presets.map((preset) => (
        <PresetCard key={preset.id} preset={preset} />
      ))}
    </Col>
  );
}

function PresetCard({ preset }: { preset: FormatPreset }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(preset.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const rename = useRenamePreset();
  const del = useDeletePreset();

  function onStartEdit() {
    setName(preset.name);
    rename.reset();
    setEditing(true);
  }

  function onCancelEdit() {
    setEditing(false);
    rename.reset();
  }

  function onSaveEdit() {
    rename.mutate({ presetId: preset.id, name }, { onSuccess: () => setEditing(false) });
  }

  function onConfirmDelete() {
    del.mutate(preset.id, { onSuccess: () => setConfirmingDelete(false) });
  }

  return (
    <Card>
      <CardHeader>
        <Row align="center" justify="between" gap={2} className="flex-wrap">
          {editing ? (
            <Row gap={2} align="center" className="flex-1">
              <Input
                aria-label="Новое имя пресета"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                loading={rename.isPending}
                onClick={onSaveEdit}
                aria-label="Сохранить имя"
              >
                <Check />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={onCancelEdit}
                aria-label="Отменить переименование"
              >
                <X />
              </Button>
            </Row>
          ) : (
            <>
              <CardTitle>{preset.name}</CardTitle>
              <Row gap={1}>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={onStartEdit}
                  aria-label={`Переименовать «${preset.name}»`}
                >
                  <Pencil />
                </Button>
                {confirmingDelete ? (
                  <Row gap={1} align="center">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      loading={del.isPending}
                      onClick={onConfirmDelete}
                    >
                      Удалить
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      Отмена
                    </Button>
                  </Row>
                ) : (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setConfirmingDelete(true)}
                    aria-label={`Удалить «${preset.name}»`}
                  >
                    <Trash2 />
                  </Button>
                )}
              </Row>
            </>
          )}
        </Row>
      </CardHeader>
      <CardContent>
        <Col gap={2}>
          <p className="text-sm text-muted-foreground">{formatPresetSummary(preset)}</p>
          {editing && rename.error && (
            <Alert variant="destructive">
              <AlertDescription>{rename.error.message}</AlertDescription>
            </Alert>
          )}
          {del.error && (
            <Alert variant="destructive">
              <AlertDescription>{del.error.message}</AlertDescription>
            </Alert>
          )}
        </Col>
      </CardContent>
    </Card>
  );
}

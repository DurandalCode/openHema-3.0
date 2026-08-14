import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Row } from "@/shared/ui/stack";
import { formatRelativeDay } from "@/shared/lib/datetime";
import { formatPresetSummary } from "@/entities/stage/lib/labels";
import type { FormatPreset } from "@/entities/stage/lib/types";

/**
 * PresetCard — карточка одного пресета библиотеки (спека 0029, FR-19/AC-12):
 * имя, сводка схемы этапов (`formatPresetSummary`, 0020) и дата обновления
 * (`formatRelativeDay`, 0024 — та же подпись, что «Регистрация» у номинаций).
 * Обе кнопки действий подписаны текстом, а не только иконкой (FR-12 из
 * «Проблема» спеки — иконки ✓/✕ без подписей были прежним недостатком).
 * Презентационный компонент: не владеет мутациями, `onRename`/`onDelete` —
 * открывают модалку/`ConfirmDialog` в `PresetLibrary`.
 */
export function PresetCard({
  preset,
  onRename,
  onDelete,
  now,
}: {
  preset: FormatPreset;
  onRename: () => void;
  onDelete: () => void;
  now?: Date;
}) {
  return (
    <Card>
      <CardHeader>
        <Row align="center" justify="between" gap={2} className="flex-wrap">
          <CardTitle>{preset.name}</CardTitle>
        </Row>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{formatPresetSummary(preset)}</p>
          <p className="text-xs text-caption-foreground">
            обновлён {formatRelativeDay(preset.updatedAt, now)}
          </p>
          <Row gap={2}>
            <Button type="button" variant="outline" size="sm" onClick={onRename}>
              Переименовать
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
              Удалить
            </Button>
          </Row>
        </div>
      </CardContent>
    </Card>
  );
}

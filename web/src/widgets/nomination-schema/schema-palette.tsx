"use client";

import { useDraggable } from "@dnd-kit/core";
import { Col } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import type { StageTypeChoice } from "@/entities/stage/lib/schema-drag";

/** PaletteItemKind — то же множество, что несёт `item` в `SchemaDragSource` для `kind: "palette"` (`entities/stage/lib/schema-drag.ts`). */
type PaletteItemKind = "roster" | StageTypeChoice;

const PALETTE_ITEMS: { item: PaletteItemKind; label: string }[] = [
  { item: "roster", label: "Ростер" },
  { item: "groups", label: "Группы" },
  { item: "bracket", label: "Плейофф" },
];

/**
 * SchemaPalette — источники перетаскивания слева от холста (спека 0031,
 * FR-12): «Ростер», «Группы», «Плейофф». Бросок «Группы»/«Плейофф» создаёт
 * этап (FR-13/FR-14); бросок «Ростер» на карточку задаёт источник правила —
 * ростер номинации (FR-15). Каждый элемент — источник dnd-kit с `data`,
 * уже равным нужному варианту `SchemaDragSource` (см. конвенцию в
 * `stage-card.tsx`) — `onDragEnd` корня экрана берёт его как есть.
 */
export function SchemaPalette() {
  return (
    <Col gap={3} data-testid="schema-palette">
      <span className="text-sm font-medium text-muted-foreground">Палитра</span>
      <Col gap={2}>
        {PALETTE_ITEMS.map(({ item, label }) => (
          <PaletteEntry key={item} item={item} label={label} />
        ))}
      </Col>
      <p className="text-xs text-muted-foreground">
        Перетащите «Группы» или «Плейофф» на холст, чтобы создать этап, а на карточку — чтобы
        сразу задать источник правила отбора. «Ростер» на карточку задаёт источником весь
        ростер номинации.
      </p>
    </Col>
  );
}

function PaletteEntry({ item, label }: { item: PaletteItemKind; label: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${item}`,
    data: { kind: "palette", item },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-testid={`palette-item-${item}`}
      className={cn(
        "cursor-grab rounded-md border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-opacity active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      {label}
    </div>
  );
}

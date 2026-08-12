"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "@/shared/lib/cn";

export type TooltipProps = {
  /** Текст/узел пояснения — не единственный носитель критичной информации (FR-9). */
  content: React.ReactNode;
  children: React.ReactElement;
  className?: string;
} & Pick<
  React.ComponentProps<typeof TooltipPrimitive.Root>,
  "open" | "defaultOpen" | "onOpenChange" | "delayDuration"
>;

/**
 * Tooltip — подсказка на месте (FR-9): раскрывается по наведению курсора
 * **и по фокусу с клавиатуры** без нажатия — это штатное поведение Radix
 * `Tooltip.Trigger` (AC-9), обёртка только приносит стилизацию проекта.
 * `children` должен быть единственным фокусируемым элементом (кнопка,
 * ссылка) — триггер рендерится через `asChild`.
 */
export function Tooltip({
  content,
  children,
  className,
  open,
  defaultOpen,
  onOpenChange,
  delayDuration,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration ?? 200}>
      <TooltipPrimitive.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
      >
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            data-slot="tooltip-content"
            sideOffset={6}
            className={cn(
              "z-50 max-w-xs rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=instant-open]:animate-in data-[state=delayed-open]:animate-in data-[state=instant-open]:fade-in-0 data-[state=delayed-open]:fade-in-0 data-[state=instant-open]:zoom-in-95 data-[state=delayed-open]:zoom-in-95",
              className,
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-popover" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

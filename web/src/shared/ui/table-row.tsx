import * as React from "react"

import { cn } from "@/shared/lib/cn"

export type TableRowTagTone =
  | "blue"
  | "amber"
  | "green"
  | "red"
  | "violet"
  | "neutral"

export type TableRowCellTone =
  | "strong"
  | "body"
  | "muted"
  | "green"
  | "red"
  | "accent"

export type TableRowCell = {
  text?: string
  sub?: string
  width?: number | string
  mono?: boolean
  size?: number
  align?: "left" | "right"
  tone?: TableRowCellTone
  strike?: boolean
  tags?: { label: string; tone?: TableRowTagTone }[]
}

export type TableRowState = "default" | "selected" | "out"

export type TableRowProps = {
  cells: TableRowCell[]
  state?: TableRowState
  height?: number
  onClick?: () => void
  className?: string
}

const cellToneClass: Record<TableRowCellTone, string> = {
  strong: "text-foreground",
  body: "text-[#6b6b76] dark:text-[#a6a6b2]",
  muted: "text-caption-foreground",
  green: "text-success",
  red: "text-destructive",
  accent: "text-primary",
}

const tagToneClass: Record<TableRowTagTone, string> = {
  blue: "bg-[#eaf0fb] text-[#1749a8] dark:bg-[#0e1a2e] dark:text-[#6ea8fe]",
  amber: "bg-[#fdf1e0] text-[#a1650a] dark:bg-[#1c1108] dark:text-[#f0a04a]",
  green: "bg-[#e9f7ef] text-[#1a8f57] dark:bg-[#0e1a12] dark:text-[#5ad18f]",
  red: "bg-[#fdeceb] text-[#c0261a] dark:bg-[#2a1010] dark:text-[#ff7a63]",
  violet: "bg-[#f0ebfd] text-[#5a35b0] dark:bg-[#170e26] dark:text-[#a98cf5]",
  neutral: "bg-[#f4f2ee] text-[#6b6b76] dark:bg-[#17171e] dark:text-[#8b8b97]",
}

const alignClass: Record<NonNullable<TableRowCell["align"]>, string> = {
  left: "text-left",
  right: "text-right",
}

const rowStateClass: Record<TableRowState, string> = {
  default:
    "bg-white dark:bg-transparent hover:bg-[#f4f2ee] dark:hover:bg-[#111116]",
  selected:
    "bg-[#fdf6f5] dark:bg-[#141019] hover:bg-[#fbeceb] dark:hover:bg-[#161119]",
  out: "bg-white dark:bg-transparent opacity-[.55] cursor-default",
}

/** UiTableRow — строка таблицы: набор ячеек с типографикой/тонами/тегами/состоянием строки. */
function TableRow({
  cells,
  state = "default",
  height,
  onClick,
  className,
}: TableRowProps) {
  const isOut = state === "out"

  return (
    <div
      data-slot="table-row"
      data-state={state}
      onClick={onClick}
      className={cn(
        "flex items-center border-b border-border px-6",
        rowStateClass[state],
        isOut ? "cursor-default" : onClick ? "cursor-pointer" : undefined,
        className
      )}
      style={{ height: height ? `${height}px` : "var(--row-h)" }}
    >
      {cells.map((cell, i) => (
        <div
          key={i}
          className={cn(
            "flex flex-col gap-0.5",
            cell.width === undefined ? "min-w-0 flex-1" : "flex-none",
            cell.align ? alignClass[cell.align] : undefined
          )}
          style={cell.width === undefined ? undefined : { width: cell.width }}
        >
          {cell.text !== undefined ? (
            <span
              className={cn(
                cell.mono ? "font-mono" : "font-sans",
                cell.tone ? cellToneClass[cell.tone] : cellToneClass.strong,
                cell.strike && isOut ? "line-through" : undefined
              )}
              style={{ fontSize: cell.size ? `${cell.size}px` : "14px" }}
            >
              {cell.text}
            </span>
          ) : null}
          {cell.sub !== undefined ? (
            <span className="font-mono text-[10px] text-destructive">
              {cell.sub}
            </span>
          ) : null}
          {cell.tags && cell.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {cell.tags.map((tag, j) => (
                <span
                  key={j}
                  className={cn(
                    "rounded-md px-2 py-[3px] text-[11px]",
                    tagToneClass[tag.tone ?? "neutral"]
                  )}
                >
                  {tag.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export { TableRow }

import * as React from "react"

import { cn } from "@/shared/lib/cn"

export type TableHeadCol = {
  label: string
  width?: number | string
  align?: "left" | "right" | "center"
}

export type TableHeadProps = {
  cols: TableHeadCol[]
  className?: string
}

const alignClass: Record<NonNullable<TableHeadCol["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
}

/** UiTableHead — шапка таблицы: моно-подписи колонок фиксированной/гибкой ширины. */
function TableHead({ cols, className }: TableHeadProps) {
  return (
    <div
      data-slot="table-head"
      className={cn(
        "flex h-[38px] items-center border-b border-border bg-[#ffffff] px-6 font-mono text-[10px] tracking-[.1em] text-caption-foreground dark:bg-[#101014]",
        className
      )}
    >
      {cols.map((col, i) => (
        <div
          key={i}
          className={cn(
            "overflow-hidden text-ellipsis whitespace-nowrap",
            col.width === undefined ? "min-w-0 flex-1" : "flex-none",
            alignClass[col.align ?? "left"]
          )}
          style={col.width === undefined ? undefined : { width: col.width }}
        >
          {col.label}
        </div>
      ))}
    </div>
  )
}

export { TableHead }

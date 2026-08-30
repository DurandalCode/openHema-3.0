import * as React from "react"

import { cn } from "@/shared/lib/cn"

export type TableScrollProps = React.ComponentProps<"div">

/**
 * TableScroll — горизонтальный скролл-контейнер для таблиц/списков шире
 * доступной ширины (spec 0044, FR-8/AC-3): на узком экране вбок скроллится
 * содержимое этого контейнера, а не вся страница.
 */
function TableScroll({ className, ...props }: TableScrollProps) {
  return (
    <div
      data-slot="table-scroll"
      className={cn("overflow-x-auto", className)}
      {...props}
    />
  )
}

export { TableScroll }

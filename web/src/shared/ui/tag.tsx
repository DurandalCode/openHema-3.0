import * as React from "react"

import { cn } from "@/shared/lib/cn"

export type TagTone = "blue" | "amber" | "green" | "red" | "violet" | "neutral"

const tagToneClasses: Record<TagTone, string> = {
  blue: "bg-[#eaf0fb] text-[#1749a8] dark:bg-[#0e1a2e] dark:text-[#6ea8fe]",
  amber: "bg-[#fdf1e0] text-[#a1650a] dark:bg-[#1c1108] dark:text-[#f0a04a]",
  green: "bg-[#e9f7ef] text-[#1a8f57] dark:bg-[#0e1a12] dark:text-[#5ad18f]",
  red: "bg-[#fdeceb] text-[#c0261a] dark:bg-[#2a1010] dark:text-[#ff7a63]",
  violet: "bg-[#f0ebfd] text-[#5a35b0] dark:bg-[#170e26] dark:text-[#a98cf5]",
  neutral: "bg-[#f4f2ee] text-[#6b6b76] dark:bg-[#17171e] dark:text-[#8b8b97]",
}

/** UiTag (спека 0022, T7) — компактный цветной ярлык, переиспользует
 * паттерн tone→класс из Badge (T6). */
function Tag({
  label,
  tone = "neutral",
  muted = false,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  label: string
  tone?: TagTone
  /** Приглушённый вид (opacity .55) — например, для неактивных значений. */
  muted?: boolean
}) {
  return (
    <span
      data-slot="tag"
      data-tone={tone}
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-md px-2 py-[3px] text-[11px] font-medium whitespace-nowrap",
        tagToneClasses[tone],
        muted && "opacity-55",
        className
      )}
      {...props}
    >
      {label}
    </span>
  )
}

export { Tag }

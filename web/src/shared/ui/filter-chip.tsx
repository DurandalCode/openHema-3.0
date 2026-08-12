import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/shared/lib/cn"

const filterChipVariants = cva(
  "inline-flex h-[var(--control-h-sm)] cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      tone: {
        idle: "bg-[#ffffff] border-[#ddd9d1] text-[#14141a] hover:border-[#b9b4aa] dark:bg-[#111116] dark:border-[#2a2a33] dark:text-[#ece9e4] dark:hover:border-[#3a3a46]",
        active:
          "bg-[#fdf6f5] border-[#f0cdc7] text-[#14141a] hover:border-[#e0b0a8] dark:bg-[#1b1116] dark:border-[#4a2230] dark:text-[#ece9e4] dark:hover:border-[#5c2b3c]",
        success:
          "bg-[#e9f7ef] border-[#bfe6cf] text-[#1a8f57] hover:border-[#a5dbbc] dark:bg-[#0e1a12] dark:border-[#1c4a2c] dark:text-[#5ad18f] dark:hover:border-[#26603a]",
        muted:
          "bg-[#f4f2ee] border-[#ddd9d1] text-[#6b6b76] hover:border-[#b9b4aa] dark:bg-[#1a1414] dark:border-[#3a2a2a] dark:text-[#b6b6c0] dark:hover:border-[#4a3535]",
      },
    },
    defaultVariants: {
      tone: "idle",
    },
  }
)

export interface FilterChipProps
  extends VariantProps<typeof filterChipVariants> {
  label: string
  count?: string | number
  dropdown?: boolean
  onClick?: () => void
  className?: string
}

function FilterChip({
  label,
  count,
  tone = "idle",
  dropdown = true,
  onClick,
  className,
}: FilterChipProps) {
  const content = (
    <>
      <span>{label}</span>
      {count !== undefined && <span className="font-mono">{count}</span>}
      {dropdown && (
        <span aria-hidden className="text-caption-foreground text-[10px]">
          ▾
        </span>
      )}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        data-slot="filter-chip"
        data-tone={tone}
        onClick={onClick}
        className={cn(filterChipVariants({ tone }), className)}
      >
        {content}
      </button>
    )
  }

  return (
    <span
      data-slot="filter-chip"
      data-tone={tone}
      className={cn(filterChipVariants({ tone }), className)}
    >
      {content}
    </span>
  )
}

export { FilterChip, filterChipVariants }

import * as React from "react"

import { cn } from "@/shared/lib/cn"

export interface EmptyStateProps {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  hint?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

function EmptyState({ eyebrow, title, hint, children, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-2 p-8 text-center",
        className
      )}
    >
      {eyebrow !== undefined && (
        <span className="font-mono text-[10px] tracking-[.14em] text-caption-foreground">
          {eyebrow}
        </span>
      )}
      <span className="text-sm font-semibold text-muted-foreground">
        {title}
      </span>
      {hint !== undefined && (
        <p className="max-w-[420px] text-[13px] leading-relaxed text-caption-foreground dark:text-[#4e4e59]">
          {hint}
        </p>
      )}
      {children}
    </div>
  )
}

export { EmptyState }

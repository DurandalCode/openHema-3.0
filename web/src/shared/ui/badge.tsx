import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/shared/lib/cn"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        gold: "bg-gold text-gold-foreground [a&]:hover:bg-gold/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/** Дизайновые статусные тона (спека 0022, T6) — независимы от `variant`. */
type BadgeTone = "live" | "success" | "info" | "warn" | "danger" | "neutral"

const badgeToneBaseClass =
  "inline-flex w-fit shrink-0 items-center gap-1.5 font-mono text-[11px] tracking-[.08em] whitespace-nowrap"

const badgeToneClasses: Record<BadgeTone, string> = {
  live: "rounded-full border px-3 py-1.5 bg-[#e9f7ef] border-[#bfe6cf] text-[#1a8f57] dark:bg-[rgba(90,209,143,0.10)] dark:border-[rgba(90,209,143,0.30)] dark:text-[#5ad18f]",
  success:
    "rounded-md border border-transparent px-[10px] py-[5px] bg-[#e9f7ef] text-[#1a8f57] dark:bg-[#0e1a12] dark:text-[#5ad18f]",
  info: "rounded-md border border-transparent px-[10px] py-[5px] bg-[#eaf0fb] text-[#1749a8] dark:bg-[#0e1a2e] dark:text-[#6ea8fe]",
  warn: "rounded-md border border-transparent px-[10px] py-[5px] bg-[#fdf1e0] text-[#a1650a] dark:bg-[#1c1108] dark:text-[#f0a04a]",
  danger:
    "rounded-md border border-transparent px-[10px] py-[5px] bg-[#fdeceb] text-[#c0261a] dark:bg-[#2a1010] dark:text-[#ff7a63]",
  neutral:
    "rounded-md border border-transparent px-[10px] py-[5px] bg-[#f4f2ee] text-[#6b6b76] dark:bg-[#1a1a20] dark:text-[#b6b6c0]",
}

function Badge({
  className,
  variant = "default",
  tone,
  dot,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean
    /** Статусный тон дизайн-системы (спека 0022). Когда задан, рендерится
     * поверх дизайновых цветов вместо `variant`. */
    tone?: BadgeTone
    /** Точка-индикатор перед текстом. По умолчанию — только для `tone="live"`. */
    dot?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "span"

  if (tone) {
    const showDot = dot ?? tone === "live"
    return (
      <Comp
        data-slot="badge"
        data-tone={tone}
        className={cn(badgeToneBaseClass, badgeToneClasses[tone], className)}
        {...props}
      >
        {showDot ? (
          <span
            data-slot="badge-dot"
            className={cn(
              "size-[7px] shrink-0 rounded-full bg-current",
              tone === "live" && "animate-pulse"
            )}
          />
        ) : null}
        {children}
      </Comp>
    )
  }

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {children}
    </Comp>
  )
}

export { Badge, badgeVariants }
export type { BadgeTone }

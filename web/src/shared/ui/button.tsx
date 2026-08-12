import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import { Slot } from "radix-ui"

import { cn } from "@/shared/lib/cn"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "font-bold border border-[#e2402c] bg-[#e2402c] text-white hover:bg-[#c9331f] hover:border-[#c9331f] dark:border-[#e2402c] dark:bg-[#e2402c] dark:text-[#0a0a0d] dark:hover:bg-[#ff5a41] dark:hover:border-[#ff5a41]",
        destructive:
          "font-bold border border-[#f3c8c2] bg-[#fdeceb] text-[#a41f15] hover:bg-[#f9dcd9] hover:border-[#eab5ad] hover:text-[#8c170f] dark:border-[#5a1e1e] dark:bg-[#3a1414] dark:text-[#ff9a8a] dark:hover:bg-[#4a1a1a] dark:hover:border-[#6a2222] dark:hover:text-[#ffb5a8]",
        outline:
          "font-semibold border border-[#ddd9d1] bg-white text-[#4a4a55] hover:bg-white hover:border-[#b9b4aa] hover:text-[#14141a] dark:border-[#2a2a33] dark:bg-transparent dark:text-[#a6a6b2] dark:hover:bg-transparent dark:hover:border-[#3a3a46] dark:hover:text-[#ece9e4]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "font-semibold border border-transparent bg-transparent text-[#6b6b76] hover:bg-[#f4f2ee] hover:border-[#e6e2da] hover:text-[#14141a] dark:text-[#8b8b97] dark:hover:bg-[#17171e] dark:hover:border-[#22222b] dark:hover:text-[#ece9e4]",
        link: "text-primary underline-offset-4 hover:underline",
        success:
          "font-semibold border border-[#bfe6cf] bg-[#e9f7ef] text-[#1a8f57] hover:bg-[#dcf1e6] hover:border-[#a5dbbc] hover:text-[#137445] dark:border-[#1c4a2c] dark:bg-[#0e1a12] dark:text-[#5ad18f] dark:hover:bg-[#12241a] dark:hover:border-[#26603a] dark:hover:text-[#7ee0a8]",
      },
      size: {
        default:
          "h-[var(--control-h-md)] rounded-md text-[13px] px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[var(--control-h-sm)] gap-1.5 rounded-[7px] text-xs px-3 has-[>svg]:px-2.5",
        lg: "h-[var(--control-h-lg)] rounded-[10px] text-sm px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Единый индикатор pending-состояния (submit и т.п.) — спиннер + исходный текст. */
    loading?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
}

export { Button, buttonVariants }

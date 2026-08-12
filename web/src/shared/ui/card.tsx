import * as React from "react"

import { cn } from "@/shared/lib/cn"

type CardProps = React.ComponentProps<"div"> & {
  eyebrow?: React.ReactNode
  title?: React.ReactNode
  meta?: React.ReactNode
  value?: React.ReactNode
  accent?: boolean
  dense?: boolean
  raised?: boolean
}

function Card({
  className,
  eyebrow,
  title,
  meta,
  value,
  accent,
  dense,
  raised,
  children,
  ...props
}: CardProps) {
  const hasHead = eyebrow != null || title != null || meta != null || value != null
  const isStatTile = hasHead || dense || raised

  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-6 rounded-lg border text-card-foreground shadow-sm",
        raised ? "bg-surface-raised" : "bg-card",
        isStatTile ? (dense ? "p-3.5" : "px-[22px] py-5") : "py-6",
        className
      )}
      {...props}
    >
      {hasHead && (
        <div data-slot="card-head" className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            {eyebrow != null && (
              <span className="font-mono text-[10px] tracking-[.1em] text-caption-foreground">
                {eyebrow}
              </span>
            )}
            {title != null && <span className="text-[15px] font-bold">{title}</span>}
            {meta != null && (
              <span className="text-[13px] text-caption-foreground">{meta}</span>
            )}
          </div>
          {value != null && (
            <span
              className={cn(
                "font-mono text-2xl font-bold",
                accent ? "text-primary" : "text-foreground"
              )}
            >
              {value}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}

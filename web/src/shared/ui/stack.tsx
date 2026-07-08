import * as React from "react";
import { cn } from "@/shared/lib/cn";

type Gap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8;
type Align = "start" | "center" | "end" | "baseline" | "stretch";
type Justify = "start" | "center" | "end" | "between" | "around" | "evenly";

const GAP_CLASS: Record<Gap, string> = {
  0: "gap-0",
  1: "gap-1",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  5: "gap-5",
  6: "gap-6",
  8: "gap-8",
};

const ALIGN_CLASS: Record<Align, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  baseline: "items-baseline",
  stretch: "items-stretch",
};

const JUSTIFY_CLASS: Record<Justify, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
  evenly: "justify-evenly",
};

type StackOwnProps<E extends React.ElementType> = {
  as?: E;
  gap?: Gap;
  align?: Align;
  justify?: Justify;
  wrap?: boolean;
};

type StackProps<E extends React.ElementType> = StackOwnProps<E> &
  Omit<React.ComponentPropsWithoutRef<E>, keyof StackOwnProps<E>>;

/**
 * createStack — общая база для Row/Col: единая точка для flex-контейнеров
 * (gap/align/justify/wrap) вместо ad-hoc `flex items-center gap-*`/
 * `grid gap-*`-как-стек по экранам. Настоящие многоколоночные grid-раскладки
 * (напр. `sm:grid-cols-2`, `TabsList grid-cols-2`) сюда не входят — это не
 * замена CSS Grid, а замена ad-hoc flex/стек-паттернов.
 */
function createStack(direction: "row" | "col", slot: string) {
  function Stack<E extends React.ElementType = "div">({
    as,
    gap = 0,
    align,
    justify,
    wrap = false,
    className,
    ...props
  }: StackProps<E>) {
    const Comp = (as || "div") as React.ElementType;
    return (
      <Comp
        data-slot={slot}
        className={cn(
          "flex",
          direction === "row" ? "flex-row" : "flex-col",
          GAP_CLASS[gap],
          align && ALIGN_CLASS[align],
          justify && JUSTIFY_CLASS[justify],
          wrap && "flex-wrap",
          className,
        )}
        {...props}
      />
    );
  }
  Stack.displayName = slot === "row" ? "Row" : "Col";
  return Stack;
}

/** Row — горизонтальный flex-контейнер (flex-row). */
export const Row = createStack("row", "row");

/** Col — вертикальный flex-контейнер (flex-col), замена `grid gap-*`-стеков. */
export const Col = createStack("col", "col");

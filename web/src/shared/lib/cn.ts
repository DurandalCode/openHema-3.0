import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** cn — объединение классов с разрешением tailwind-конфликтов. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

"use client";

import { useTheme } from "next-themes";
import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

/**
 * Обёртка над `sonner`'s `<Toaster/>`, стилизованная под токены темы
 * проекта. Тема берётся из `next-themes` (`useTheme().resolvedTheme`) —
 * компонент не определяет светлую/тёмную тему самостоятельно (NFR-1):
 * второй источник темы в приложении не появляется. Пока `next-themes` не
 * разрешил тему (гидратация), передаём `"system"` — временное значение,
 * а не собственное определение.
 */
function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  const theme = (resolvedTheme as ToasterProps["theme"]) ?? "system";

  return (
    <SonnerToaster
      theme={theme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--popover)",
          "--success-text": "var(--success)",
          "--success-border": "var(--border)",
          "--error-bg": "var(--popover)",
          "--error-text": "var(--destructive)",
          "--error-border": "var(--border)",
        } as React.CSSProperties
      }
      closeButton
      {...props}
    />
  );
}

export { Toaster };

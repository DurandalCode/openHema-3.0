import * as React from "react";

import { cn } from "@/shared/lib/cn";

export interface StatusPageProps {
  /** Код состояния, показанный крупно над заголовком (например, "404", "403", "500"). */
  code: string;
  title: React.ReactNode;
  description: React.ReactNode;
  /** Переходы дальше (кнопки/ссылки) — минимум один, по FR-2/FR-3/FR-4. */
  actions?: React.ReactNode;
  /** Второстепенная строка под действиями — например, копируемый ID ошибки (FR-4). */
  footnote?: React.ReactNode;
  className?: string;
}

/**
 * StatusPage — общая презентационная раскладка страниц-состояний маршрута:
 * «не найдено» (404), «нужны права организатора» (403), «ошибка» (500).
 * Спека 0023 (FR-2/FR-3/FR-4, AC-2/AC-3/AC-5). Чисто презентационный
 * компонент — конкретные тексты и действия задаёт вызывающая страница.
 */
function StatusPage({
  code,
  title,
  description,
  actions,
  footnote,
  className,
}: StatusPageProps) {
  return (
    <div
      data-slot="status-page"
      className={cn(
        "mx-auto flex w-full max-w-lg flex-col items-center gap-3 px-4 py-24 text-center",
        className,
      )}
    >
      <span
        data-slot="status-page-code"
        className="font-mono text-sm tracking-[.14em] text-caption-foreground"
      >
        {code}
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
      {actions !== undefined && (
        <div
          data-slot="status-page-actions"
          className="mt-2 flex flex-wrap items-center justify-center gap-3"
        >
          {actions}
        </div>
      )}
      {footnote !== undefined && (
        <div
          data-slot="status-page-footnote"
          className="mt-6 text-xs text-caption-foreground"
        >
          {footnote}
        </div>
      )}
    </div>
  );
}

export { StatusPage };

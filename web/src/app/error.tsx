"use client";

import * as React from "react";
import { Button } from "@/shared/ui/button";
import { StatusPage } from "@/shared/ui/status-page";

/**
 * Страница необработанной ошибки рендера (спека 0023, FR-4/AC-5/NFR-4).
 * Обязан быть клиентским компонентом и принимать `{error, reset}` по
 * контракту Next.js error boundary (`app/error.tsx`).
 *
 * ВАЖНО (NFR-4): текст ниже намеренно не обещает, что повтор безопасен и
 * что операция применится ровно один раз — журнал боёв event-sourced с
 * конфликтом версии потока (ADR 0011), идемпотентность произвольного
 * действия ничем не обеспечена. Формулировка ограничена тем, что известно
 * точно: действие могло примениться частично или не примениться вовсе.
 *
 * `global-error.tsx` сюда осознанно не заводится (см. `plan.md` «Риски») —
 * ошибки самого root layout он ловит отдельно и требует собственных
 * `<html>/<body>`, отдельная тема на будущее.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const errorId = error.digest || "неизвестен";
  const [copied, setCopied] = React.useState(false);

  function handleCopy() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(errorId).catch(() => {});
    }
    setCopied(true);
  }

  return (
    <StatusPage
      code="500"
      title="Что-то пошло не так"
      description="Не удалось отрисовать эту страницу. Вы можете повторить попытку. Действие, которое выполнялось до сбоя, могло примениться частично или не примениться вовсе — прежде чем повторять, проверьте состояние на экране."
      actions={
        <>
          <Button onClick={() => reset()}>Повторить</Button>
          <Button variant="outline" onClick={handleCopy}>
            {copied ? "Идентификатор скопирован" : "Скопировать идентификатор"}
          </Button>
        </>
      }
      footnote={`ID ошибки: ${errorId}`}
    />
  );
}

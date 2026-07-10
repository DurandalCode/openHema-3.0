"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { useSubmitApplication } from "../api/use-submit-application";

/**
 * SubmitApplicationButton — кнопка «Подать заявку» на публичной странице
 * номинации. Видна только аутентифицированному пользователю (гейтинг —
 * на уровне вызывающего виджета, FR-1/FR-11).
 */
export function SubmitApplicationButton({ nominationId }: { nominationId: string }) {
  const submit = useSubmitApplication();
  const [done, setDone] = useState(false);

  if (done) {
    return <p className="text-sm text-muted-foreground">Заявка подана</p>;
  }

  return (
    <div>
      <Button
        type="button"
        size="sm"
        loading={submit.isPending}
        onClick={() => submit.mutate(nominationId, { onSuccess: () => setDone(true) })}
      >
        Подать заявку
      </Button>
      {submit.error && (
        <p className="mt-1 text-xs text-destructive">{submit.error.message}</p>
      )}
    </div>
  );
}

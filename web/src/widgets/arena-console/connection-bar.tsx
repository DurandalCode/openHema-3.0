"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Row } from "@/shared/ui/stack";
import { connectionLabel } from "@/entities/arena-live/lib/connection";

/**
 * ConnectionBar — полоса потери связи живого канала арены (спека 0033,
 * FR-24, AC-11): «Связь потеряна · N секунд» с растущим счётчиком и кнопкой
 * «Переподключиться». Показывается на обеих страницах консоли (управление и
 * панель) — рендерится самим `ArenaConsole`, не дублируется в каждом виде.
 *
 * Счётчик тикает раз в секунду сам (не полагается на внешние ре-рендеры) —
 * `lostSinceMs` не меняется, пока канал не восстановится, поэтому без
 * собственного таймера полоса застыла бы на «0 секунд».
 */
export function ConnectionBar({
  lostSinceMs,
  onReconnect,
}: {
  lostSinceMs: number;
  onReconnect: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Row
      role="status"
      align="center"
      justify="between"
      gap={3}
      className="flex-wrap rounded-lg border border-amber-600/40 bg-amber-500/10 px-4 py-3 text-amber-700 dark:text-amber-400"
    >
      <span className="text-sm font-medium">{connectionLabel(now - lostSinceMs)}</span>
      <Button type="button" size="sm" variant="outline" onClick={onReconnect}>
        Переподключиться
      </Button>
    </Row>
  );
}

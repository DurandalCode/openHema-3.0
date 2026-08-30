"use client";

import Link from "next/link";
import { useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { PageHeader } from "@/shared/ui/page-header";
import { Col, Row } from "@/shared/ui/stack";
import { useArenaLive } from "@/features/arena-live/api/use-arena-live";
import { useArenaTimer } from "@/features/arena-timer/api/use-arena-timer";
import { boutNumber } from "@/entities/arena-live/lib/types";
import { isOffline } from "@/entities/arena-live/lib/connection";
import type { BoutBoard } from "@/entities/pool/lib/types";
import { ConnectionBar } from "./connection-bar";
import { ModeSwitch, type ConsoleMode } from "./mode-switch";
import { ManagementView } from "./management-view";
import { BoutPanelView } from "./bout-panel-view";

/**
 * ArenaConsole — страница площадки (спека 0033): единственный владелец
 * живого канала арены и таймера на странице (`useArenaLive`/`useArenaTimer`
 * вызываются здесь один раз — FR-2, plan.md «Композиция страницы
 * площадки») и переключатель режимов «Управление ареной» ⇄ «Ведение боя»
 * (FR-1): режим — query-параметр `?mode=bout` на том же пути (решение
 * пользователя), поэтому браузерный «назад» и `Esc` возвращают в
 * управление, не открывая заново живой канал (FR-2/FR-3, AC-1/AC-2).
 *
 * Верхняя строка (название площадки + «Открыть табло») — одна и та же в
 * обоих режимах (FR-11: переход на табло доступен из обоих режимов).
 * Строка ниже — переключаемая подшапка: в управлении — крошка «← Все
 * площадки» + контекст пула; в панели — только кнопка возврата, контекст
 * боя и переключатель режима, и больше ничего (FR-20).
 */
export function ArenaConsole({
  arenaId,
  arenaName,
  initialBoard,
}: {
  arenaId: string;
  arenaName: string;
  initialBoard: BoutBoard | null;
}) {
  const live = useArenaLive(arenaId, "panel", initialBoard);
  const { display, controls } = useArenaTimer(arenaId, live);
  const router = useRouter();
  const searchParams = useSearchParams();

  const mode: ConsoleMode = searchParams.get("mode") === "bout" ? "bout" : "management";
  const board = live.snapshot?.board ?? null;
  const hasPool = !!board?.pool;
  const offline = isOffline(live.connection);
  const num = boutNumber(board);

  const setMode = useCallback(
    (next: ConsoleMode) => {
      const params = new URLSearchParams(searchParams);
      if (next === "bout") {
        params.set("mode", "bout");
      } else {
        params.delete("mode");
      }
      const qs = params.toString();
      router.push(`/admin/arenas/${encodeURIComponent(arenaId)}${qs ? `?${qs}` : ""}`);
    },
    [arenaId, router, searchParams],
  );

  // FR-3: Esc делает то же, что «← <арена> · управление» — только в панели
  // (в управлении возврата уже некуда, Esc там ни на что не влияет).
  useEffect(() => {
    if (mode !== "bout") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMode("management");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, setMode]);

  return (
    <Col gap={4}>
      {offline && live.lostSinceMs !== null && (
        <ConnectionBar lostSinceMs={live.lostSinceMs} onReconnect={live.reconnect} />
      )}

      {/*
        FR-1/FR-10 (спека 0045): на телефоне режим «Ведение боя» рисует
        свою компактную шапку внутри `BoutPanelView` (md:hidden) — эти два
        ряда там дублировали бы её, поэтому скрыты `md:`-условием только в
        режиме `bout`. В «Управлении ареной» (вне скоупа 0045) — без
        изменений, видны на любой ширине.
      */}
      <div className={mode === "bout" ? "hidden md:block" : undefined}>
        <PageHeader
          title={arenaName || "Площадка"}
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/arenas/${arenaId}/scoreboard`} target="_blank">
                Открыть табло
              </Link>
            </Button>
          }
        />
      </div>

      <Row
        align="center"
        justify="between"
        gap={3}
        className={cn("flex-wrap", mode === "bout" && "hidden md:flex")}
      >
        {mode === "management" ? (
          <Row align="center" gap={2} className="text-sm text-muted-foreground">
            <Link href="/admin/arenas" className="hover:text-foreground">
              ← Все площадки
            </Link>
            {board?.pool && (
              <>
                <span className="text-border">/</span>
                <span>
                  {board.pool.nominationName} · {board.pool.name}
                </span>
              </>
            )}
          </Row>
        ) : (
          <Row align="center" gap={3} className="text-sm text-muted-foreground">
            <Button type="button" variant="outline" size="sm" onClick={() => setMode("management")}>
              ← {arenaName || "Арена"} · управление
            </Button>
            {board?.pool && (
              <span>
                {board.pool.nominationName} · {board.pool.name}
                {num ? ` · бой ${num.current} из ${num.total}` : ""}
              </span>
            )}
          </Row>
        )}
        <ModeSwitch mode={mode} canEnterBout={hasPool} onSelect={setMode} />
      </Row>

      {mode === "management" ? (
        <ManagementView
          arenaId={arenaId}
          live={live}
          display={display}
          controls={controls}
          offline={offline}
          onEnterBoutPanel={() => setMode("bout")}
        />
      ) : (
        <BoutPanelView
          arenaId={arenaId}
          arenaName={arenaName}
          live={live}
          display={display}
          controls={controls}
          offline={offline}
          onReturnToManagement={() => setMode("management")}
        />
      )}
    </Col>
  );
}

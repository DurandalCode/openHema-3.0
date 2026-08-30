import { AlertRow, alertSummary } from "./alert-row";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import type { ConsoleAlert } from "@/entities/tournament-console/lib/types";

/**
 * AttentionFeed — лента «требует внимания» пульта (спека 0043, FR-14):
 * список замеченных операционных проблем. Пуста — не ошибка (FR-16, записи
 * гаснут сами вместе с условием, которое их породило).
 *
 * Полный вид — для планшета-и-шире (спека 0045, `hidden md:flex` у
 * вызывающего `ConsoleScreen`), без изменений. Мобильный компактный вид —
 * `AttentionFeedCompact` ниже.
 */
export function AttentionFeed({ alerts, now = new Date() }: { alerts: ConsoleAlert[]; now?: Date }) {
  if (alerts.length === 0) {
    return <p className="text-sm text-caption-foreground">Всё в порядке — сигналов нет.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert, i) => (
        // ConsoleAlert не несёт собственного id (не хранится, FR-16) — ключ
        // из состава полей, идентифицирующих запись однозначно в рамках
        // одного кадра.
        <AlertRow key={`${alert.kind}-${alert.arenaId}-${alert.nominationId}-${alert.boutId}-${i}`} alert={alert} now={now} />
      ))}
    </div>
  );
}

/**
 * AttentionFeedCompact — свёрнутая лента «требует внимания» для телефона
 * (спека 0045, T11, FR-12/FR-13): одна строка «ВНИМАНИЕ · N» с текстом
 * первого сигнала (`alertSummary`); по тапу раскрывается в `Sheet` со
 * списком всех N сигналов через тот же `AlertRow`, что и полный
 * `AttentionFeed` — разметка строки не дублируется. При отсутствии
 * сигналов — тот же текст «Всё в порядке», что и у полного вида, без
 * строки-триггера (AC-5).
 */
export function AttentionFeedCompact({ alerts, now = new Date() }: { alerts: ConsoleAlert[]; now?: Date }) {
  if (alerts.length === 0) {
    return <p className="text-sm text-caption-foreground">Всё в порядке — сигналов нет.</p>;
  }
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex w-full flex-col items-start gap-0.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-left text-sm hover:bg-destructive/10"
        >
          <span className="font-mono text-xs font-semibold tracking-wide text-destructive uppercase">
            ВНИМАНИЕ · {alerts.length}
          </span>
          <span className="min-w-0 break-words text-caption-foreground">{alertSummary(alerts[0])}</span>
        </button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Требует внимания</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2">
          {alerts.map((alert, i) => (
            <AlertRow key={`${alert.kind}-${alert.arenaId}-${alert.nominationId}-${alert.boutId}-${i}`} alert={alert} now={now} />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useState, type MouseEvent } from "react";
import { Tag } from "@/shared/ui/tag";
import { TableRow } from "@/shared/ui/table-row";
import { formatDateTime } from "@/shared/lib/datetime";
import { fighterStatusLabel, originLabel, withdrawalReasonLabel } from "@/entities/fighter/lib/labels";
import { hasLinkedAccount, type Fighter } from "@/entities/fighter/lib/types";

/** MAX_VISIBLE_TAGS — сколько тегов участий показываем до сворачивания «+N» (spec FR-2). */
const MAX_VISIBLE_TAGS = 3;

function ParticipationCell({
  fighter,
  nominationTitleById,
}: {
  fighter: Fighter;
  nominationTitleById: Map<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (fighter.participations.length === 0) {
    return <span className="text-sm text-caption-foreground">—</span>;
  }

  const visible = expanded ? fighter.participations : fighter.participations.slice(0, MAX_VISIBLE_TAGS);
  const hidden = fighter.participations.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((p) => {
        const title = nominationTitleById.get(p.nominationId) ?? p.nominationId;
        const removed = p.status === "PARTICIPATION_STATUS_REMOVED";
        return (
          <Tag
            key={p.nominationId}
            label={removed ? `${title} · снят` : title}
            tone={removed ? "neutral" : "blue"}
            muted={removed}
          />
        );
      })}
      {hidden > 0 && (
        <button
          type="button"
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          className="rounded-md bg-[#f4f2ee] px-2 py-[3px] text-[11px] font-medium text-caption-foreground hover:bg-[#e9e7e1] dark:bg-[#17171e] dark:hover:bg-[#1e1e26]"
        >
          +{hidden}
        </button>
      )}
    </div>
  );
}

/**
 * FighterRow — строка таблицы «Бойцы» (spec FR-1..FR-6): пять колонок
 * (боец/клуб/участие/статус/происхождение) на `TableRow` (`cells`-API,
 * plan «Web» → `shared/`): `state: "out"` + `cells[].strike` дают
 * приглушение и зачёркивание выбывшего (FR-4) бесплатно, `cells[].sub` —
 * причину под статусом (FR-3). Ячейка участия — `node` со сворачиванием
 * «+N» (FR-2), ячейка происхождения — `node` с датой появления (FR-5).
 *
 * Клик по строке открывает карточку (spec NFR-5, AC-7); единственный
 * интерактивный элемент внутри строки — кнопка разворота «+N» —
 * останавливает всплытие, чтобы не открывать карточку тем же кликом.
 */
export function FighterRow({
  fighter,
  nominationTitleById,
  onOpenCard,
}: {
  fighter: Fighter;
  nominationTitleById: Map<string, string>;
  onOpenCard: (fighterId: string) => void;
}) {
  const withdrawn = fighter.status === "FIGHTER_STATUS_WITHDRAWN";
  const reason = withdrawalReasonLabel(fighter.withdrawalReason);

  return (
    <TableRow
      state={withdrawn ? "out" : "default"}
      onClick={() => onOpenCard(fighter.id)}
      cells={[
        {
          text: fighter.name || "—",
          tone: "strong",
          strike: true,
          // Бейдж «привязана учётка» (спека 0040, FR-8/AC-6) — только admin
          // видит эту проекцию, публичные/пользовательские экраны её не
          // получают (ADR 0016 не расширяется).
          tags: hasLinkedAccount(fighter) ? [{ label: "учётка", tone: "violet" }] : undefined,
        },
        { text: fighter.club || "—", tone: "body", width: 180 },
        { node: <ParticipationCell fighter={fighter} nominationTitleById={nominationTitleById} /> },
        {
          text: fighterStatusLabel(fighter.status),
          sub: withdrawn && reason ? reason : undefined,
          tone: withdrawn ? "muted" : "green",
          width: 140,
        },
        {
          node: (
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-foreground">{originLabel(fighter.fromApplication)}</span>
              <span className="text-xs text-caption-foreground">{formatDateTime(fighter.createdAt)}</span>
            </div>
          ),
          width: 200,
        },
      ]}
    />
  );
}

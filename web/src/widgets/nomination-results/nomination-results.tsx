"use client";

import { Download, Medal, Trophy } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import {
  formatPlace,
  hasPlaces,
  podium,
  type NominationResultEntry,
  type NominationResults as NominationResultsDto,
  type NominationResultsSection,
} from "@/entities/nomination-results/lib/types";
import { nominationResultsExportUrl } from "./api/requests";

/** Понятная причина недоступности экспорта, пока нет ни одного протокола (FR-13). */
const EXPORT_UNAVAILABLE_REASON = "протокол появится, когда закончится хотя бы один финальный этап";

/**
 * ExportAction — кнопка «Экспорт» итогового протокола в CSV (спека 0041,
 * FR-11/FR-12). Задизейблена с понятной причиной (`title`), пока ни один
 * терминальный этап номинации не завершён (FR-13) — та же проверка
 * `hasPlaces`, что решает видимость секций. Обычная навигация браузера на
 * BFF-роут (`<a href>`), не `fetch`+blob (план, «Риски»).
 */
function ExportAction({ nominationId, exportAvailable }: { nominationId: string; exportAvailable: boolean }) {
  if (!exportAvailable) {
    return (
      <Button variant="outline" size="sm" disabled title={EXPORT_UNAVAILABLE_REASON}>
        <Download />
        Экспорт
      </Button>
    );
  }

  return (
    <Button asChild variant="outline" size="sm">
      <a href={nominationResultsExportUrl(nominationId)}>
        <Download />
        Экспорт
      </a>
    </Button>
  );
}

/**
 * PodiumCard — одна карточка пьедестала (спека 0021, NFR-3: читаемо с
 * проектора/телефона — крупный шрифт, не строка таблицы). При диапазоне
 * `3–4` без боя за 3-е место обе строки рендерятся отдельными карточками с
 * одинаковой подписью места (FR-11a/FR-17).
 */
function PodiumCard({ entry }: { entry: NominationResultEntry }) {
  const champion = entry.placeFrom === 1 && entry.placeTo === 1;
  return (
    <Card className="w-40 shrink-0">
      <CardContent className="flex flex-col items-center gap-2 px-4 py-4 text-center">
        {champion ? (
          <Trophy className="size-6 text-gold" />
        ) : (
          <Medal className="size-6 text-muted-foreground" />
        )}
        <Badge variant={champion ? "gold" : "secondary"} className="px-3 py-1 text-base">
          {formatPlace(entry)}
        </Badge>
        <span className="text-sm font-medium">{entry.fighter.name}</span>
        {entry.fighter.club && (
          <span className="text-xs text-muted-foreground">{entry.fighter.club}</span>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * ResultsSection — пьедестал и полный протокол одного терминального этапа
 * (FR-9/FR-10). Недоигранная секция (`!hasPlaces`) рендерится только при
 * `showUnfinished` (админский экран схемы, FR-19) — с пометкой «этап не
 * доигран», без мест.
 */
function ResultsSection({
  section,
  showUnfinished,
}: {
  section: NominationResultsSection;
  showUnfinished: boolean;
}) {
  const finished = hasPlaces(section);
  if (!finished && !showUnfinished) return null;

  const top = podium(section);

  return (
    <Card>
      <CardHeader>
        <Row align="center" justify="between" gap={2} className="flex-wrap">
          <CardTitle className="text-base">{section.stageTitle}</CardTitle>
          {!finished && <Badge variant="outline">этап не доигран</Badge>}
        </Row>
      </CardHeader>
      {finished && (
        <CardContent>
          <Col gap={4}>
            <Row gap={3} className="flex-wrap">
              {top.map((entry, i) => (
                <PodiumCard key={`podium-${entry.fighter.fighterId || i}`} entry={entry} />
              ))}
            </Row>
            <Col gap={1} className="border-t pt-3">
              {section.entries.map((entry, i) => (
                <Row
                  key={`entry-${entry.fighter.fighterId || i}`}
                  align="center"
                  gap={2}
                  className="flex-wrap text-sm"
                >
                  <span className="w-12 shrink-0 font-medium tabular-nums">{formatPlace(entry)}</span>
                  <span>{entry.fighter.name}</span>
                  {entry.fighter.club && (
                    <span className="text-xs text-muted-foreground">({entry.fighter.club})</span>
                  )}
                  <span className="text-xs text-muted-foreground sm:ml-auto">{entry.originLabel}</span>
                </Row>
              ))}
            </Col>
            {section.placesFromOverallOrder && (
              <p className="text-xs text-muted-foreground">
                Места сведены по сводному порядку между группами — без нормировки на их размер.
              </p>
            )}
          </Col>
        </CardContent>
      )}
    </Card>
  );
}

/**
 * NominationResults — итоговый протокол номинации целиком (спека 0021,
 * FR-9..FR-19): секция на каждый терминальный этап (FR-10), у каждой свой
 * пьедестал — сквозной нумерации мест по номинации нет (AC-9). Read-only,
 * общий для публичного экрана (`showUnfinished`/`canExport` не переданы —
 * только доигранные секции, без экспорта, FR-15) и админского экрана схемы
 * (`showUnfinished`, FR-19 — недоигранные секции видны с пометкой, отвечает
 * на «почему номинация ещё не завершена»). Не рендерит ничего, если
 * показывать нечего (AC-15) — ни пустых карточек, ни лишней разметки.
 *
 * `canExport` (спека 0041, FR-11..FR-16) включает кнопку «Экспорт» CSV —
 * несмотря на то, что сам RPC `GetNominationResults` публичный (без
 * авторизации), экспорт спека отдаёт только admin: проп включён ТОЛЬКО на
 * `admin/nominations/[id]/stages/page.tsx`, публичная страница номинации
 * (`nomination-public-screen.tsx`) его не передаёт.
 */
export function NominationResults({
  results,
  showUnfinished = false,
  canExport = false,
}: {
  results: NominationResultsDto;
  showUnfinished?: boolean;
  canExport?: boolean;
}) {
  const visible = results.sections.filter((s) => hasPlaces(s) || showUnfinished);
  if (visible.length === 0) return null;

  const exportAvailable = results.sections.some((s) => hasPlaces(s));

  return (
    <Col id="results" tabIndex={-1} gap={4} className="scroll-mt-24">
      {canExport && (
        <Row justify="end">
          <ExportAction nominationId={results.nominationId} exportAvailable={exportAvailable} />
        </Row>
      )}
      {visible.map((section) => (
        <ResultsSection key={section.stageId} section={section} showUnfinished={showUnfinished} />
      ))}
    </Col>
  );
}

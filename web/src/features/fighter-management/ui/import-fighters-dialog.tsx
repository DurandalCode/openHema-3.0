"use client";

import { useState, type ChangeEvent } from "react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Col, Row } from "@/shared/ui/stack";
import type { ImportReport } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { useImportFighters } from "../api/use-import-fighters";
import { ImportReportTable } from "./import-report-table";

/** TEMPLATE_URL — статический образец файла (FR-11), `web/public/`. */
const TEMPLATE_URL = "/fighters-import-template.csv";

/**
 * summaryText — сводка по файлу (FR-4). Формулировка зависит от шага:
 * в предпросмотре ещё ничего не записано («будет создано», AC-2), в отчёте
 * — уже записано (FR-10).
 */
function summaryText(report: ImportReport): string {
  const { rowsRead, created, updated, skipped, rejected } = report.summary;
  const createdLabel = report.dryRun ? "Будет создано" : "Создано";
  return [
    `Прочитано: ${rowsRead}`,
    `${createdLabel}: ${created}`,
    `Дополнено: ${updated}`,
    `Пропущено: ${skipped}`,
    `Отклонено: ${rejected}`,
  ].join(" · ");
}

/**
 * ImportFightersDialog — импорт ростера из файла (admin, спека 0049) в трёх
 * состояниях одного диалога:
 *
 * 1. **выбор** — файл (CSV/XLSX), номинации-умолчания на всю загрузку
 *    (FR-5a) и ссылка на образец (FR-11);
 * 2. **предпросмотр** — сводка (FR-4) и разбор по строкам (FR-3), ничего
 *    ещё не записано (AC-2); кнопка «Импортировать» отправляет ТОТ ЖЕ файл
 *    с `dryRun: false`;
 * 3. **отчёт** — тот же разбор уже по факту записи (FR-10).
 *
 * Шаг выводится из самого отчёта (`null` → выбор, `dryRun` → предпросмотр,
 * иначе отчёт), а не хранится отдельным состоянием: два источника истины о
 * шаге расходились бы. Отчёт живёт в `useState` ровно пока открыт диалог —
 * в кеш RQ он не кладётся (план, раздел «State»).
 *
 * Отдельного тоста на успех нет намеренно (правило 0023 — канал обратной
 * связи): результат показывает сам шаг 3, и тост дублировал бы его.
 */
export function ImportFightersDialog({
  nominations,
  open,
  onOpenChange,
}: {
  nominations: Nomination[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [defaultNominationIds, setDefaultNominationIds] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importFighters = useImportFighters();

  const step = report === null ? "select" : report.dryRun ? "preview" : "report";

  function reset() {
    setFile(null);
    setDefaultNominationIds(new Set());
    setReport(null);
    setError(null);
    importFighters.reset();
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) reset();
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setError(null);
  }

  function toggleNomination(id: string) {
    setDefaultNominationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function run(dryRun: boolean) {
    if (!file) return;
    setError(null);
    importFighters.mutate(
      { file, dryRun, nominationIds: [...defaultNominationIds] },
      {
        onSuccess: (next) => setReport(next),
        onError: (err) => setError(err.message),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Импорт бойцов из файла</DialogTitle>
          <DialogDescription>
            {step === "select"
              ? "Файл CSV или XLSX с колонками «имя», «клуб», «номинации». Сначала разбор с предпросмотром — в ростер ничего не пишется."
              : step === "preview"
                ? "Предпросмотр: в ростер ещё ничего не записано. Проверьте разбор и подтвердите импорт."
                : "Импорт выполнен. Отклонённые строки поправьте в файле и загрузите его повторно — уже заведённые бойцы не задвоятся."}
          </DialogDescription>
        </DialogHeader>

        {step === "select" ? (
          <Col gap={4}>
            <Col gap={2}>
              <Label htmlFor="import-fighters-file">Файл</Label>
              <Input
                id="import-fighters-file"
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={onFileChange}
              />
              <p className="text-xs text-muted-foreground">
                Не знаете формат —{" "}
                <a className="underline" href={TEMPLATE_URL} download>
                  скачайте образец
                </a>
                : строка заголовка и две строки-примера.
              </p>
            </Col>

            {nominations.length > 0 && (
              <Col gap={2}>
                <Label>Номинации по умолчанию</Label>
                <p className="text-xs text-muted-foreground">
                  Применяются только к строкам с пустой колонкой номинаций; указанное в
                  файле всегда важнее.
                </p>
                <Row gap={4} wrap>
                  {nominations.map((n) => (
                    <Row key={n.id} align="center" gap={2}>
                      <Checkbox
                        id={`import-fighters-nom-${n.id}`}
                        checked={defaultNominationIds.has(n.id)}
                        onCheckedChange={() => toggleNomination(n.id)}
                      />
                      <Label htmlFor={`import-fighters-nom-${n.id}`} className="font-normal">
                        {n.title}
                      </Label>
                    </Row>
                  ))}
                </Row>
              </Col>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Отмена
              </Button>
              <Button
                type="button"
                disabled={!file || importFighters.isPending}
                loading={importFighters.isPending}
                onClick={() => run(true)}
              >
                Проверить файл
              </Button>
            </DialogFooter>
          </Col>
        ) : (
          <Col gap={4}>
            <p data-testid="import-summary" className="text-sm text-muted-foreground">
              {report ? summaryText(report) : null}
            </p>

            <div className="max-h-[50vh] overflow-y-auto">
              <ImportReportTable rows={report?.rows ?? []} nominations={nominations} />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              {step === "preview" ? (
                <>
                  <Button type="button" variant="outline" onClick={() => setReport(null)}>
                    Назад
                  </Button>
                  <Button
                    type="button"
                    disabled={importFighters.isPending}
                    loading={importFighters.isPending}
                    onClick={() => run(false)}
                  >
                    Импортировать
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={() => handleOpenChange(false)}>
                  Готово
                </Button>
              )}
            </DialogFooter>
          </Col>
        )}
      </DialogContent>
    </Dialog>
  );
}

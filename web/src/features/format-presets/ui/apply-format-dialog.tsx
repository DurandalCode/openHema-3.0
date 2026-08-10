"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Col, Row } from "@/shared/ui/stack";
import { useApplyFormat } from "../api/use-apply-format";
import { usePresets } from "../api/use-presets";

type SourceChoice = "preset" | "nomination";

/**
 * ApplyFormatDialog — применение формата к номинации `nominationId` (спека
 * 0020, FR-13/FR-15): источник — пресет из библиотеки либо схема
 * номинации-донора того же турнира (простое текстовое поле id — полноценный
 * селектор номинаций не обязателен на этой волне, FR-15). Разрешено только
 * для нетронутой схемы (FR-13/FR-14) — сервер отвечает 409 понятным текстом,
 * клиент показывает его как есть.
 */
export function ApplyFormatDialog({ nominationId }: { nominationId: string }) {
  const [open, setOpen] = useState(false);
  const [sourceChoice, setSourceChoice] = useState<SourceChoice>("preset");
  const [presetId, setPresetId] = useState("");
  const [sourceNominationId, setSourceNominationId] = useState("");

  const presets = usePresets();
  const apply = useApplyFormat(nominationId);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSourceChoice("preset");
      setPresetId("");
      setSourceNominationId("");
      apply.reset();
    }
  }

  function onSourceChoiceChange(next: SourceChoice) {
    setSourceChoice(next);
  }

  const canSubmit =
    sourceChoice === "preset" ? presetId.length > 0 : sourceNominationId.trim().length > 0;

  function onSubmit() {
    const source =
      sourceChoice === "preset"
        ? { presetId }
        : { sourceNominationId: sourceNominationId.trim() };
    apply.mutate(source, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Wand2 /> Применить формат
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Применить формат</DialogTitle>
          <DialogDescription>
            Готовая схема из пресета или другой номинации — одним действием (FR-13/FR-15).
          </DialogDescription>
        </DialogHeader>
        <Col gap={4}>
          <Row gap={2}>
            <Button
              type="button"
              size="sm"
              variant={sourceChoice === "preset" ? "default" : "outline"}
              onClick={() => onSourceChoiceChange("preset")}
            >
              Пресет из библиотеки
            </Button>
            <Button
              type="button"
              size="sm"
              variant={sourceChoice === "nomination" ? "default" : "outline"}
              onClick={() => onSourceChoiceChange("nomination")}
            >
              Скопировать из номинации
            </Button>
          </Row>

          {sourceChoice === "preset" ? (
            <Col gap={1}>
              <Label htmlFor="apply-format-preset">Пресет</Label>
              <Select value={presetId} onValueChange={setPresetId}>
                <SelectTrigger id="apply-format-preset">
                  <SelectValue placeholder="Выберите пресет" />
                </SelectTrigger>
                <SelectContent>
                  {(presets.data ?? []).map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Col>
          ) : (
            <Col gap={1}>
              <Label htmlFor="apply-format-source-nomination">Номинация-донор (id)</Label>
              <Input
                id="apply-format-source-nomination"
                value={sourceNominationId}
                onChange={(e) => setSourceNominationId(e.target.value)}
                placeholder="id номинации того же турнира"
              />
            </Col>
          )}

          <Alert data-testid="replace-warning">
            <AlertDescription>
              Схема номинации будет заменена целиком: прежние этапы исчезнут, появятся этапы
              формата в черновике с пустым составом.
            </AlertDescription>
          </Alert>

          {apply.error && (
            <Alert variant="destructive">
              <AlertDescription>{apply.error.message}</AlertDescription>
            </Alert>
          )}
        </Col>
        <DialogFooter>
          <Button type="button" disabled={!canSubmit} loading={apply.isPending} onClick={onSubmit}>
            Применить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

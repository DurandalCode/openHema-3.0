"use client";

import { useState, type FocusEvent, type KeyboardEvent } from "react";
import { Check, Save } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { FilterChip } from "@/shared/ui/filter-chip";
import { Input } from "@/shared/ui/input";
import { Row } from "@/shared/ui/stack";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import { useApplyFormat } from "../api/use-apply-format";
import { usePresets } from "../api/use-presets";
import { useSavePreset } from "../api/use-save-preset";

const ARMED_LABEL = "Заменить схему?";

/**
 * PresetChips — пресеты формата чипами в тулбаре (спека 0031, FR-25/FR-26):
 * первый клик по чипу «взводит» его (подпись меняется на «Заменить схему?»,
 * тон выделяется), второй клик по этому же чипу применяет пресет (AC-16);
 * клик по другому чипу или мимо (потеря фокуса тулбара) сбрасывает взвод.
 * «Сохранить как пресет» — инлайн-поле с автофокусом вместо модалки: Enter
 * или кнопка подтверждения сохраняют, пустое имя закрывает поле без запроса,
 * 409 (имя занято) оставляет поле открытым (AC-17).
 *
 * Заменяет `ApplyFormatDialog` + `SavePresetDialog` (решение пользователя №3,
 * `spec.md` «Решения по открытым вопросам») — тот же проп `nominationId`, что
 * позволяет виджету просто подставить этот компонент вместо двух модалок.
 * Отказы обеих операций переведены в русский текст на уровне хуков
 * (`useApplyFormat`/`useSavePreset` → `presetErrorMessage`, FR-27) — здесь
 * они только показываются тостом; постоянных `Alert`-баннеров нет (FR-31,
 * правило 0023).
 */
export function PresetChips({ nominationId }: { nominationId: string }) {
  const presets = usePresets();
  const apply = useApplyFormat(nominationId);
  const save = useSavePreset();

  const [armedPresetId, setArmedPresetId] = useState<string | null>(null);
  const [savingOpen, setSavingOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

  function onChipClick(presetId: string) {
    if (armedPresetId === presetId) {
      apply.mutate(
        { presetId },
        {
          onSuccess: () => {
            toastSuccess("Формат применён");
            setArmedPresetId(null);
          },
          onError: (err: Error) => toastError(err.message),
        },
      );
      return;
    }
    setArmedPresetId(presetId);
  }

  function onToolbarBlur(e: FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setArmedPresetId(null);
    }
  }

  function openSaving() {
    setPresetName("");
    save.reset();
    setSavingOpen(true);
  }

  function submitSaving() {
    const name = presetName.trim();
    if (!name) {
      setSavingOpen(false);
      return;
    }
    save.mutate(
      { name, nominationId },
      {
        onSuccess: () => {
          toastSuccess("Пресет сохранён");
          setSavingOpen(false);
        },
        onError: (err: Error) => toastError(err.message),
      },
    );
  }

  function onSavingKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitSaving();
    } else if (e.key === "Escape") {
      setSavingOpen(false);
    }
  }

  return (
    <Row gap={2} align="center" wrap onBlur={onToolbarBlur}>
      {(presets.data ?? []).map((preset) => {
        const armed = armedPresetId === preset.id;
        return (
          <FilterChip
            key={preset.id}
            label={armed ? ARMED_LABEL : preset.name}
            tone={armed ? "active" : "idle"}
            dropdown={false}
            onClick={() => onChipClick(preset.id)}
          />
        );
      })}

      {savingOpen ? (
        <Row gap={1} align="center">
          <Input
            autoFocus
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={onSavingKeyDown}
            placeholder="Имя пресета"
            aria-label="Имя пресета"
            className="h-[var(--control-h-sm)] w-40"
          />
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            loading={save.isPending}
            onClick={submitSaving}
            aria-label="Сохранить пресет"
          >
            <Check />
          </Button>
        </Row>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={openSaving}>
          <Save /> Сохранить как пресет
        </Button>
      )}
    </Row>
  );
}

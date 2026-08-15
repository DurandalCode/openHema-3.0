"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Row } from "@/shared/ui/stack";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import type { Nomination } from "@/entities/nomination/lib/types";
import { canClose, canReopen, reopenBlockedReason } from "../api/registration-gate";
import { useUpdateNomination } from "../api/use-update-nomination";
import { useCloseRegistration } from "../api/use-close-registration";
import { useReopenRegistration } from "../api/use-reopen-registration";
import type { NominationInput } from "../api/requests";

type EditableField = "title" | "capacity" | "rulesUrl";

function capacityToText(capacity: number | null): string {
  return capacity === null ? "" : String(capacity);
}

/**
 * NominationInlineHeader — инлайн-правка шапки номинации на экране схемы
 * (спека 0031, FR-1..FR-5): название, плановая вместимость и ссылка на
 * регламент правятся прямо на месте (клик → поле ввода, Enter/потеря
 * фокуса сохраняет, `Esc` откатывает к последнему сохранённому значению),
 * плюс кнопка «Закрыть приём»/«Открыть приём» по тому же гейту, что и в
 * списке номинаций (`registration-gate.ts`).
 *
 * Сознательное отступление от канона модалок 0024–0029 (решение
 * пользователя №2, `spec.md`): вместимость питает диагностику схемы,
 * которую организатор читает на этом же экране.
 *
 * `UpdateNomination` принимает номинацию целиком — каждая правка одного
 * инлайн-поля отправляет **текущие** значения остальных полей
 * (включая `description`, которого в этой панели нет вовсе) вместе с
 * изменённым, чтобы не затирать их частичной правкой (риск из `plan.md`).
 *
 * Компонент не делает первичный запрос — номинацию передаёт вызывающая
 * сторона (server component страницы через `initialData`/`useNomination`).
 */
export function NominationInlineHeader({
  tournamentId,
  nomination,
}: {
  tournamentId: string;
  nomination: Nomination;
}) {
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [titleDraft, setTitleDraft] = useState(nomination.title);
  const [capacityDraft, setCapacityDraft] = useState(capacityToText(nomination.fighterCapacity));
  const [rulesDraft, setRulesDraft] = useState(nomination.metadata.rulesUrl);
  const [titleError, setTitleError] = useState<string | null>(null);

  // Синхронизация черновиков со свежим значением номинации (после
  // инвалидации `use-update-nomination.ts` родитель передаёт новый проп) —
  // кроме поля, которое сейчас редактируется, чтобы не затереть набираемый
  // ввод чужим рефетчем.
  useEffect(() => {
    if (editingField !== "title") setTitleDraft(nomination.title);
  }, [nomination.title, editingField]);
  useEffect(() => {
    if (editingField !== "capacity") setCapacityDraft(capacityToText(nomination.fighterCapacity));
  }, [nomination.fighterCapacity, editingField]);
  useEffect(() => {
    if (editingField !== "rulesUrl") setRulesDraft(nomination.metadata.rulesUrl);
  }, [nomination.metadata.rulesUrl, editingField]);

  const update = useUpdateNomination(tournamentId);
  const closeRegistration = useCloseRegistration(tournamentId);
  const reopenRegistration = useReopenRegistration(tournamentId);

  function startEditing(field: EditableField) {
    if (field === "title") {
      setTitleDraft(nomination.title);
      setTitleError(null);
    } else if (field === "capacity") {
      setCapacityDraft(capacityToText(nomination.fighterCapacity));
    } else {
      setRulesDraft(nomination.metadata.rulesUrl);
    }
    setEditingField(field);
  }

  function cancelEditing() {
    setTitleDraft(nomination.title);
    setCapacityDraft(capacityToText(nomination.fighterCapacity));
    setRulesDraft(nomination.metadata.rulesUrl);
    setTitleError(null);
    setEditingField(null);
  }

  /**
   * save — общая точка отправки `UpdateNomination`: `patch` — только
   * изменённое поле, остальные поля (включая `description`) берутся из
   * текущей `nomination`, чтобы не затираться (см. риск в шапке файла).
   */
  function save(patch: Partial<NominationInput>, successMessage: string) {
    const input: NominationInput = {
      title: nomination.title,
      description: nomination.description,
      fighterCapacity: nomination.fighterCapacity,
      metadata: { rulesUrl: nomination.metadata.rulesUrl },
      ...patch,
    };
    update.mutate(
      { id: nomination.id, input },
      {
        onSuccess: () => toastSuccess(successMessage),
        onError: (err: Error) => toastError(err.message),
      },
    );
  }

  function commitTitle() {
    if (editingField !== "title") return;
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      // FR-3: инлайн-ошибка у поля, запрос не отправляется, значение
      // возвращается к сохранённому (поле остаётся в режиме правки, чтобы
      // ошибка была видна рядом с ним).
      setTitleDraft(nomination.title);
      setTitleError("Введите название");
      return;
    }
    setTitleError(null);
    setEditingField(null);
    save({ title: trimmed }, "Название сохранено");
  }

  function commitCapacity() {
    if (editingField !== "capacity") return;
    setEditingField(null);
    const trimmed = capacityDraft.trim();
    const fighterCapacity = trimmed === "" ? null : Number(trimmed);
    save({ fighterCapacity }, "Вместимость сохранена");
  }

  function commitRulesUrl() {
    if (editingField !== "rulesUrl") return;
    setEditingField(null);
    save({ metadata: { rulesUrl: rulesDraft } }, "Ссылка на регламент сохранена");
  }

  function onFieldKeyDown(
    e: KeyboardEvent<HTMLInputElement>,
    commit: () => void,
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditing();
    }
  }

  const closeAllowed = canClose(nomination.status);
  const reopenAllowed = canReopen(nomination.status);
  const reopenReason = reopenBlockedReason(nomination.status);
  const registrationPending = closeRegistration.isPending || reopenRegistration.isPending;

  function registrationLabel(): string {
    if (closeAllowed) return "Закрыть приём";
    if (reopenAllowed) return "Открыть приём";
    return reopenReason ?? "Открыть приём";
  }

  function onToggleRegistration() {
    if (closeAllowed) {
      closeRegistration.mutate(nomination.id, {
        onSuccess: () => toastSuccess("Приём заявок закрыт"),
        onError: (err: Error) => toastError(err.message),
      });
    } else if (reopenAllowed) {
      reopenRegistration.mutate(nomination.id, {
        onSuccess: () => toastSuccess("Приём заявок открыт"),
        onError: (err: Error) => toastError(err.message),
      });
    }
  }

  return (
    <div
      data-slot="nomination-inline-header"
      className="flex flex-col gap-3 border-b border-border bg-surface-raised px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        {editingField === "title" ? (
          <div className="flex flex-col gap-1">
            <Input
              aria-label="Название"
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => onFieldKeyDown(e, commitTitle)}
              aria-invalid={titleError ? true : undefined}
              className="max-w-sm text-lg font-semibold"
            />
            {titleError && <p className="text-xs text-destructive">{titleError}</p>}
          </div>
        ) : (
          <button
            type="button"
            aria-label="Название"
            onClick={() => startEditing("title")}
            className="w-fit text-left text-lg font-semibold text-foreground outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {nomination.title || "Без названия"}
          </button>
        )}

        <Row gap={4} className="flex-wrap text-sm text-caption-foreground">
          <Row gap={1} align="center">
            <span>Бойцов:</span>
            {editingField === "capacity" ? (
              <Input
                aria-label="Кол-во бойцов"
                type="number"
                min={0}
                autoFocus
                placeholder="Не задано"
                value={capacityDraft}
                onChange={(e) => setCapacityDraft(e.target.value)}
                onBlur={commitCapacity}
                onKeyDown={(e) => onFieldKeyDown(e, commitCapacity)}
                className="h-7 w-24"
              />
            ) : (
              <button
                type="button"
                aria-label="Кол-во бойцов"
                onClick={() => startEditing("capacity")}
                className="outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {nomination.fighterCapacity === null ? "не задано" : nomination.fighterCapacity}
              </button>
            )}
          </Row>

          <Row gap={1} align="center">
            <span>Регламент:</span>
            {editingField === "rulesUrl" ? (
              <Input
                aria-label="Ссылка на регламент"
                type="url"
                autoFocus
                placeholder="https://example.com/rules"
                value={rulesDraft}
                onChange={(e) => setRulesDraft(e.target.value)}
                onBlur={commitRulesUrl}
                onKeyDown={(e) => onFieldKeyDown(e, commitRulesUrl)}
                className="h-7 w-56"
              />
            ) : (
              <button
                type="button"
                aria-label="Ссылка на регламент"
                onClick={() => startEditing("rulesUrl")}
                className="max-w-xs truncate outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {nomination.metadata.rulesUrl || "не указана"}
              </button>
            )}
          </Row>
        </Row>
      </div>

      <Button
        type="button"
        variant={closeAllowed ? "outline" : "default"}
        disabled={(!closeAllowed && !reopenAllowed) || registrationPending}
        loading={registrationPending}
        onClick={onToggleRegistration}
      >
        {registrationLabel()}
      </Button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import { formatRelativeTime } from "@/shared/lib/datetime";
import { useUnsavedGuard } from "@/shared/lib/use-unsaved-guard";
import type { Tournament } from "@/entities/tournament/lib/types";
import {
  draftToTournament,
  entryFeeAmountToMinor,
  entryFeeMinorToAmount,
  tournamentDraftChanges,
  validateTournamentDraft,
  type TournamentDraft,
  type TournamentDraftErrors,
} from "@/entities/tournament/lib/draft";
import type { UpdateTournamentInput } from "../api/requests";
import { useUpdateTournament } from "../api/use-update-tournament";
import { TournamentSettingsForm } from "./tournament-settings-form";
import { TournamentPreview } from "./tournament-preview";
import { UnsavedChangesBar } from "./unsaved-changes-bar";

function draftFromTournament(t: Tournament): TournamentDraft {
  return {
    title: t.title,
    description: t.description,
    emblemUrl: t.emblemUrl,
    eventStartAt: t.eventStartAt || null,
    eventEndAt: t.eventEndAt || null,
    contacts: t.contacts.map((c) => ({ type: c.type, value: c.value })),
    chiefJudge: t.chiefJudge,
    regulationsUrl: t.regulationsUrl,
    venueName: t.venueName,
    venueAddress: t.venueAddress,
    entryFeeAmount: entryFeeMinorToAmount(t.entryFeeMinor),
    entryFeeCurrency: t.entryFeeCurrency,
  };
}

function draftToUpdateInput(draft: TournamentDraft): UpdateTournamentInput {
  const entryFeeMinor = entryFeeAmountToMinor(draft.entryFeeAmount);
  return {
    title: draft.title,
    description: draft.description,
    emblemUrl: draft.emblemUrl,
    eventStartAt: draft.eventStartAt,
    eventEndAt: draft.eventEndAt,
    contacts: draft.contacts.filter((c) => c.value.trim() !== ""),
    chiefJudge: draft.chiefJudge,
    regulationsUrl: draft.regulationsUrl,
    venueName: draft.venueName,
    venueAddress: draft.venueAddress,
    entryFeeMinor,
    // «не задан» затирает валюту (FR-21), тот же приём, что в
    // `draftToTournament` (превью) — иначе можно уйти на сервер с суммой
    // null, но не пустой валютой.
    entryFeeCurrency: entryFeeMinor === null ? "" : draft.entryFeeCurrency,
  };
}

/**
 * TournamentScreen — клиентский корень экрана «Турнир» (spec 0029, A11):
 * держит `draft` рядом с `saved`-снапшотом (`useState`, ADR 0006 — это
 * несохранённый ввод, а не серверное состояние), шапку раздела (`PageHeader`
 * — крошка, заголовок, «Изменено …», «Отменить правки»/«Сохранить») и два
 * столбца «редактор | превью». Живое превью — чистая функция
 * `draftToTournament` от текущего `draft` (FR-3/FR-5, NFR-3): без запросов и
 * задержки.
 */
export function TournamentScreen({ tournament }: { tournament: Tournament }) {
  const [saved, setSaved] = useState(tournament);
  const [draft, setDraft] = useState<TournamentDraft>(() => draftFromTournament(tournament));
  const [errors, setErrors] = useState<TournamentDraftErrors>({});

  const update = useUpdateTournament();

  const changes = tournamentDraftChanges(saved, draft);
  const previewTournament = draftToTournament(saved, draft);

  // Guard несохранённых изменений (спека 0039, FR-13, FR-15): `changes`
  // уже пересчитывается в 0 и после «Отменить правки» (draft возвращается
  // к saved), и после успешного сохранения (saved/draft синхронизируются
  // в handleSave) — отдельно сбрасывать признак не нужно, он снимается тем
  // же значением, что уже показывает `UnsavedChangesBar`.
  useUnsavedGuard(changes.length > 0, "профиль турнира");

  function handleReset() {
    setDraft(draftFromTournament(saved));
    setErrors({});
  }

  function handleSave() {
    const validationErrors = validateTournamentDraft(draft);
    setErrors(validationErrors);
    // Object.keys, а не перечисление конкретных полей — иначе поле,
    // добавленное в validateTournamentDraft (напр. regulationsUrl/
    // entryFeeAmount, spec 0037), показывало бы ошибку под инпутом, но не
    // блокировало сохранение: форма ушла бы на сервер с заведомо invalid
    // данными несмотря на видимую ошибку.
    if (Object.keys(validationErrors).length > 0) return;

    update.mutate(draftToUpdateInput(draft), {
      onSuccess: (nextTournament) => {
        setSaved(nextTournament);
        setDraft(draftFromTournament(nextTournament));
        setErrors({});
        toastSuccess("Профиль турнира сохранён");
      },
      onError: (err: Error) => {
        toastError(err.message);
      },
    });
  }

  const crumb = saved.title ? `ТУРНИР · ${saved.title.toUpperCase()}` : "ТУРНИР";
  const lastChanged = saved.updatedAt ? formatRelativeTime(saved.updatedAt) : "";

  return (
    <div data-slot="tournament-screen" className="flex flex-col">
      <PageHeader
        crumb={crumb}
        title="Профиль турнира"
        meta={lastChanged ? `Изменено ${lastChanged}` : undefined}
        secondary={
          <Button
            type="button"
            variant="outline"
            disabled={changes.length === 0}
            onClick={handleReset}
          >
            Отменить правки
          </Button>
        }
        action={
          <Button type="button" loading={update.isPending} onClick={handleSave}>
            Сохранить
          </Button>
        }
      />

      <div className="flex flex-col gap-6 p-4">
        <UnsavedChangesBar changes={changes} />

        <div className="grid gap-6 lg:grid-cols-2">
          <TournamentSettingsForm value={draft} onChange={setDraft} errors={errors} />
          <TournamentPreview tournament={previewTournament} />
        </div>
      </div>
    </div>
  );
}

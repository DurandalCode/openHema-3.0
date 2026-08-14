"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import { formatRelativeTime } from "@/shared/lib/datetime";
import type { Tournament } from "@/entities/tournament/lib/types";
import {
  draftToTournament,
  tournamentDraftChanges,
  validateTournamentDraft,
  type TournamentDraft,
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
  };
}

function draftToUpdateInput(draft: TournamentDraft): UpdateTournamentInput {
  return {
    title: draft.title,
    description: draft.description,
    emblemUrl: draft.emblemUrl,
    eventStartAt: draft.eventStartAt,
    eventEndAt: draft.eventEndAt,
    contacts: draft.contacts.filter((c) => c.value.trim() !== ""),
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
  const [errors, setErrors] = useState<{ title?: string; eventEndAt?: string }>({});

  const update = useUpdateTournament();

  const changes = tournamentDraftChanges(saved, draft);
  const previewTournament = draftToTournament(saved, draft);

  function handleReset() {
    setDraft(draftFromTournament(saved));
    setErrors({});
  }

  function handleSave() {
    const validationErrors = validateTournamentDraft(draft);
    setErrors(validationErrors);
    if (validationErrors.title || validationErrors.eventEndAt) return;

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

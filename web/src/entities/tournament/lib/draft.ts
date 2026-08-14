import type { ContactType, Tournament } from "./types";

/**
 * TournamentDraft — состояние формы «Профиль турнира» (spec 0029): те же
 * поля, что и `Tournament`, но без `id`/`isActive`/`createdAt`/`updatedAt`
 * (эти держит `saved`-снапшот, не черновик) и с контактами без `id`/
 * `position` — редактор их не назначает, сервер расставит сам.
 */
export type ContactDraft = { type: ContactType; value: string };

export type TournamentDraft = {
  title: string;
  description: string;
  emblemUrl: string;
  eventStartAt: string | null;
  eventEndAt: string | null;
  contacts: ContactDraft[];
};

function contactWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "контактов";
  const mod10 = n % 10;
  if (mod10 === 1) return "контакт";
  if (mod10 >= 2 && mod10 <= 4) return "контакта";
  return "контактов";
}

/** normalizeContacts — обрезает пробелы и отбрасывает пустые контакты:
 * пустая строка, добавленная кнопкой «+ Добавить» и не заполненная, не
 * должна ни считаться изменением, ни попадать в превью/сохранение. */
function normalizeContacts(contacts: ContactDraft[]): ContactDraft[] {
  return contacts
    .map((c) => ({ type: c.type, value: c.value.trim() }))
    .filter((c) => c.value !== "");
}

/** Число позиционно различающихся контактов между двумя (уже нормализованными
 * снаружи) списками — сравнение по индексу, а не по множеству: экран правит
 * контакты по позиции в списке (см. `tournament-settings-form.tsx`). */
function contactsDiffCount(a: ContactDraft[], b: ContactDraft[]): number {
  const len = Math.max(a.length, b.length);
  let count = 0;
  for (let i = 0; i < len; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y || x.type !== y.type || x.value !== y.value) count++;
  }
  return count;
}

/**
 * tournamentDraftChanges — человекочитаемый список изменённых полей для
 * полосы несохранённых изменений (spec FR-7, AC-4/AC-5): «название»,
 * «описание», «дата начала», «дата окончания», «эмблема», «N контакт(а/ов)».
 * Идентичный черновик даёт пустой список.
 */
export function tournamentDraftChanges(
  saved: Tournament,
  draft: TournamentDraft,
): string[] {
  const changes: string[] = [];

  if (draft.title !== saved.title) changes.push("название");
  if (draft.description !== saved.description) changes.push("описание");
  if ((draft.eventStartAt ?? "") !== (saved.eventStartAt ?? "")) {
    changes.push("дата начала");
  }
  if ((draft.eventEndAt ?? "") !== (saved.eventEndAt ?? "")) {
    changes.push("дата окончания");
  }
  if (draft.emblemUrl !== saved.emblemUrl) changes.push("эмблема");

  const savedContacts = normalizeContacts(
    saved.contacts.map((c) => ({ type: c.type, value: c.value })),
  );
  const draftContacts = normalizeContacts(draft.contacts);
  const contactsChanged = contactsDiffCount(savedContacts, draftContacts);
  if (contactsChanged > 0) {
    changes.push(`${contactsChanged} ${contactWord(contactsChanged)}`);
  }

  return changes;
}

/**
 * validateTournamentDraft — ровно те три правила, что уже проверяет сервер
 * (`Service.UpdateActive`): пустое название и некорректный диапазон дат
 * (окончание раньше начала, окончание без начала). Сообщения по-русски
 * (spec FR-11/FR-12, AC-7/AC-8).
 */
export function validateTournamentDraft(
  draft: TournamentDraft,
): { title?: string; eventEndAt?: string } {
  const errors: { title?: string; eventEndAt?: string } = {};

  if (!draft.title.trim()) {
    errors.title = "Введите название турнира";
  }

  if (draft.eventEndAt) {
    if (!draft.eventStartAt) {
      errors.eventEndAt = "Дата окончания указана без даты начала";
    } else if (
      new Date(draft.eventEndAt).getTime() < new Date(draft.eventStartAt).getTime()
    ) {
      errors.eventEndAt = "Дата окончания не может быть раньше даты начала";
    }
  }

  return errors;
}

/**
 * draftToTournament — объект для живого превью (spec FR-3/FR-5): значения
 * полей — из черновика, `id`/`isActive`/`createdAt`/`updatedAt` — из
 * сохранённого турнира (превью не меняет их и они не редактируются формой),
 * пустые контакты отброшены — превью само показывает правило «пустые
 * контакты не сохраняются», а не подписью рядом.
 */
export function draftToTournament(
  saved: Tournament,
  draft: TournamentDraft,
): Tournament {
  return {
    id: saved.id,
    title: draft.title,
    description: draft.description,
    eventStartAt: draft.eventStartAt ?? "",
    eventEndAt: draft.eventEndAt ?? "",
    emblemUrl: draft.emblemUrl,
    isActive: saved.isActive,
    contacts: normalizeContacts(draft.contacts),
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  };
}

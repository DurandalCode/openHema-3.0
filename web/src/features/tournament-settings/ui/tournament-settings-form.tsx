"use client";

import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { useUpdateTournament } from "../api/use-update-tournament";
import type { ContactType, Tournament } from "@/entities/tournament/lib/types";

const CONTACT_TYPES: { value: ContactType; label: string }[] = [
  { value: "CONTACT_TYPE_TELEGRAM", label: "Telegram" },
  { value: "CONTACT_TYPE_VK", label: "VK" },
  { value: "CONTACT_TYPE_FACEBOOK", label: "Facebook" },
  { value: "CONTACT_TYPE_WEBSITE", label: "Сайт" },
  { value: "CONTACT_TYPE_EMAIL", label: "Email" },
  { value: "CONTACT_TYPE_OTHER", label: "Другое" },
];

type ContactRow = { type: ContactType; value: string };

/** TournamentSettingsForm — редактирование профиля активного турнира. */
export function TournamentSettingsForm({ tournament }: { tournament: Tournament }) {
  const [title, setTitle] = useState(tournament.title);
  const [description, setDescription] = useState(tournament.description);
  const [emblemUrl, setEmblemUrl] = useState(tournament.emblemUrl);
  const [eventStartAt, setEventStartAt] = useState(toLocalInput(tournament.eventStartAt));
  const [eventEndAt, setEventEndAt] = useState(toLocalInput(tournament.eventEndAt));
  const [contacts, setContacts] = useState<ContactRow[]>(
    tournament.contacts.map((c) => ({ type: c.type, value: c.value })),
  );

  const update = useUpdateTournament();

  function addContact() {
    setContacts((rows) => [...rows, { type: "CONTACT_TYPE_TELEGRAM", value: "" }]);
  }

  function removeContact(i: number) {
    setContacts((rows) => rows.filter((_, idx) => idx !== i));
  }

  function setContactType(i: number, type: ContactType) {
    setContacts((rows) => rows.map((r, idx) => (idx === i ? { ...r, type } : r)));
  }

  function setContactValue(i: number, value: string) {
    setContacts((rows) => rows.map((r, idx) => (idx === i ? { ...r, value } : r)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    update.mutate({
      title,
      description,
      emblemUrl,
      eventStartAt: eventStartAt.length > 0 ? new Date(eventStartAt).toISOString() : null,
      eventEndAt: eventEndAt.length > 0 ? new Date(eventEndAt).toISOString() : null,
      contacts: contacts.filter((c) => c.value.trim() !== ""),
    });
  }

  const error = update.error?.message ?? null;

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="title">Название *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Описание</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="eventStartAt">Дата и время начала</Label>
          <Input
            id="eventStartAt"
            type="datetime-local"
            value={eventStartAt}
            onChange={(e) => setEventStartAt(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="eventEndAt">Дата и время окончания</Label>
          <Input
            id="eventEndAt"
            type="datetime-local"
            value={eventEndAt}
            onChange={(e) => setEventEndAt(e.target.value)}
            // Для однодневного турнира оставляется пустым.
          />
          <p className="text-xs text-muted-foreground">
            Для однодневного турнира оставьте пустым.
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="emblemUrl">URL эмблемы</Label>
        <Input
          id="emblemUrl"
          type="url"
          placeholder="https://cdn.example.com/logo.png"
          value={emblemUrl}
          onChange={(e) => setEmblemUrl(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Контакты</Label>
          <Button type="button" variant="outline" size="sm" onClick={addContact}>
            + Добавить
          </Button>
        </div>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Контакты ещё не добавлены.
          </p>
        ) : (
          <div className="grid gap-2">
            {contacts.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={c.type}
                  onChange={(e) => setContactType(i, e.target.value as ContactType)}
                >
                  {CONTACT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <Input
                  value={c.value}
                  onChange={(e) => setContactValue(i, e.target.value)}
                  placeholder="Значение (URL или @handle)"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeContact(i)}
                >
                  Удалить
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Сохранение…" : "Сохранить"}
        </Button>
      </div>
    </form>
  );
}

/** toLocalInput превращает ISO-строку в значение для <input datetime-local>. */
function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
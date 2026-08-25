"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { DateTimeField } from "@/shared/ui/datetime-field";
import { Col, Row } from "@/shared/ui/stack";
import type { ContactType } from "@/entities/tournament/lib/types";
import type { ContactDraft, TournamentDraft } from "@/entities/tournament/lib/draft";
import { TournamentProgramEditor } from "./tournament-program-editor";

const CONTACT_TYPES: { value: ContactType; label: string }[] = [
  { value: "CONTACT_TYPE_TELEGRAM", label: "Telegram" },
  { value: "CONTACT_TYPE_VK", label: "VK" },
  { value: "CONTACT_TYPE_FACEBOOK", label: "Facebook" },
  { value: "CONTACT_TYPE_WEBSITE", label: "Сайт" },
  { value: "CONTACT_TYPE_EMAIL", label: "Email" },
  { value: "CONTACT_TYPE_OTHER", label: "Другое" },
];

export type TournamentSettingsFormErrors = {
  title?: string;
  eventEndAt?: string;
  regulationsUrl?: string;
  entryFeeAmount?: string;
};

export type TournamentSettingsFormProps = {
  value: TournamentDraft;
  onChange: (value: TournamentDraft) => void;
  errors: TournamentSettingsFormErrors;
};

/**
 * TournamentSettingsForm — редактирование профиля активного турнира (spec
 * 0029, A10): **контролируемая** форма — `value`/`onChange`/`errors` в
 * пропсах, своей мутации и кнопки сабмита нет (действия — в шапке экрана,
 * `TournamentScreen`). Поля прежние (FR-10) + превью эмблемы (FR-13) +
 * подписи правил контактов (FR-14).
 */
export function TournamentSettingsForm({
  value,
  onChange,
  errors,
}: TournamentSettingsFormProps) {
  function set<K extends keyof TournamentDraft>(key: K, next: TournamentDraft[K]) {
    onChange({ ...value, [key]: next });
  }

  function addContact() {
    set("contacts", [...value.contacts, { type: "CONTACT_TYPE_TELEGRAM", value: "" }]);
  }

  function removeContact(i: number) {
    set(
      "contacts",
      value.contacts.filter((_, idx) => idx !== i),
    );
  }

  function updateContact(i: number, patch: Partial<ContactDraft>) {
    set(
      "contacts",
      value.contacts.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    );
  }

  return (
    <Col gap={5}>
      <Col gap={2}>
        <Label htmlFor="title">Название *</Label>
        <Input
          id="title"
          value={value.title}
          onChange={(e) => set("title", e.target.value)}
          aria-invalid={errors.title ? true : undefined}
        />
        {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
      </Col>

      <Col gap={2}>
        <Label htmlFor="description">Описание</Label>
        <Textarea
          id="description"
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          rows={4}
        />
      </Col>

      <Col gap={2}>
        {/* Настоящая 2-колоночная сетка (не стек) — оставлена как CSS Grid,
            Row/Col тут не подходят: обе даты должны быть равной ширины и
            переходить в одну колонку на мобильном. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Col gap={2}>
            <Label htmlFor="eventStartAt">Дата и время начала</Label>
            <DateTimeField
              id="eventStartAt"
              value={value.eventStartAt}
              onChange={(v) => set("eventStartAt", v)}
              withTime
              clearable
            />
          </Col>
          <Col gap={2}>
            <Label htmlFor="eventEndAt">Дата и время окончания</Label>
            <DateTimeField
              id="eventEndAt"
              value={value.eventEndAt}
              onChange={(v) => set("eventEndAt", v)}
              withTime
              clearable
            />
            {errors.eventEndAt && (
              <p className="text-xs text-destructive">{errors.eventEndAt}</p>
            )}
          </Col>
        </div>
        <p className="text-xs text-muted-foreground">
          Для однодневного турнира оставьте поле окончания пустым.
        </p>
      </Col>

      <Col gap={2}>
        <Label htmlFor="emblemUrl">URL эмблемы</Label>
        <Row align="center" gap={3}>
          <EmblemPreview url={value.emblemUrl} />
          <Input
            id="emblemUrl"
            type="url"
            placeholder="https://cdn.example.com/logo.png"
            value={value.emblemUrl}
            onChange={(e) => set("emblemUrl", e.target.value)}
            className="flex-1"
          />
        </Row>
      </Col>

      <Col gap={2}>
        <Label htmlFor="chiefJudge">Главный судья</Label>
        <Input
          id="chiefJudge"
          value={value.chiefJudge}
          onChange={(e) => set("chiefJudge", e.target.value)}
        />
      </Col>

      <Col gap={2}>
        <Label htmlFor="regulationsUrl">Ссылка на регламент</Label>
        <Input
          id="regulationsUrl"
          type="url"
          placeholder="https://cdn.example.com/rules.pdf"
          value={value.regulationsUrl}
          onChange={(e) => set("regulationsUrl", e.target.value)}
          aria-invalid={errors.regulationsUrl ? true : undefined}
        />
        {errors.regulationsUrl && (
          <p className="text-xs text-destructive">{errors.regulationsUrl}</p>
        )}
      </Col>

      <Col gap={2}>
        <Label>Место проведения</Label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Col gap={2}>
            <Label htmlFor="venueName">Название площадки</Label>
            <Input
              id="venueName"
              value={value.venueName}
              onChange={(e) => set("venueName", e.target.value)}
            />
          </Col>
          <Col gap={2}>
            <Label htmlFor="venueAddress">Адрес площадки</Label>
            <Input
              id="venueAddress"
              value={value.venueAddress}
              onChange={(e) => set("venueAddress", e.target.value)}
            />
          </Col>
        </div>
      </Col>

      <Col gap={2}>
        <Label>Взнос за номинацию</Label>
        <Row gap={3}>
          <Col gap={2} className="flex-1">
            <Label htmlFor="entryFeeAmount">Сумма взноса</Label>
            <Input
              id="entryFeeAmount"
              type="number"
              min={0}
              step="0.01"
              placeholder="0"
              value={value.entryFeeAmount}
              onChange={(e) => set("entryFeeAmount", e.target.value)}
              aria-invalid={errors.entryFeeAmount ? true : undefined}
            />
            {errors.entryFeeAmount && (
              <p className="text-xs text-destructive">{errors.entryFeeAmount}</p>
            )}
          </Col>
          <Col gap={2}>
            <Label htmlFor="entryFeeCurrency">Валюта</Label>
            <Input
              id="entryFeeCurrency"
              placeholder="RUB"
              className="w-24"
              value={value.entryFeeCurrency}
              onChange={(e) => set("entryFeeCurrency", e.target.value)}
            />
          </Col>
        </Row>
        <p className="text-xs text-muted-foreground">
          Пустая сумма — взнос не задан (не то же самое, что бесплатное
          участие).
        </p>
      </Col>

      <Col gap={2}>
        <TournamentProgramEditor
          value={value.program}
          onChange={(program) => set("program", program)}
        />
      </Col>

      <Col gap={2}>
        <Row align="center" justify="between">
          <Label>Контакты</Label>
          <Button type="button" variant="outline" size="sm" onClick={addContact}>
            + Добавить
          </Button>
        </Row>
        <p className="text-xs text-muted-foreground">
          Пустые контакты не сохраняются. Значением может быть и ссылка, и
          @handle — адрес соберётся сам.
        </p>
        {value.contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Контакты ещё не добавлены.
          </p>
        ) : (
          <Col gap={2}>
            {value.contacts.map((c, i) => (
              <Row key={i} align="center" gap={2}>
                <Select
                  value={c.type}
                  onValueChange={(type) => updateContact(i, { type: type as ContactType })}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={c.value}
                  onChange={(e) => updateContact(i, { value: e.target.value })}
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
              </Row>
            ))}
          </Col>
        )}
      </Col>
    </Col>
  );
}

/**
 * EmblemPreview — миниатюра эмблемы рядом с полем URL (spec FR-13, AC-10):
 * пустой или недоступный адрес даёт нейтральную заглушку, а не битую
 * картинку. Состояние «битый адрес» сбрасывается при смене `url`, чтобы
 * заглушка после исправления адреса не залипала.
 */
function EmblemPreview({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [url]);

  const trimmed = url.trim();
  const showImage = trimmed !== "" && !broken;

  return (
    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={trimmed}
          alt="Эмблема турнира"
          className="size-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <ImageOff className="size-5 text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );
}

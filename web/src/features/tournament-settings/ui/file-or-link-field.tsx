"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Col, Row } from "@/shared/ui/stack";
import { toastError } from "@/shared/lib/toast";
import { formatFileSize, resolveFileOrLink } from "@/entities/tournament/lib/files";
import type { Tournament, TournamentFile } from "@/entities/tournament/lib/types";
import {
  deleteTournamentFileRequest,
  uploadTournamentFileRequest,
  type FileKind,
} from "../api/requests";
import { uploadFileErrorMessage } from "../api/errors";

const ACCEPTED_TYPE_LABELS: Record<FileKind, string> = {
  regulations: "PDF",
  emblem: "PNG, JPEG или WebP",
};

export type FileOrLinkFieldProps = {
  label: string;
  urlValue: string;
  onUrlChange: (value: string) => void;
  file: TournamentFile;
  kind: FileKind;
  /** MIME-типы через запятую (атрибут `accept` инпута и локальная сверка). */
  accept: string;
  maxBytes: number;
  /** Круглая миниатюра рядом с полем (эмблема). Регламент — без превью. */
  showPreview?: boolean;
  onUploaded: (tournament: Tournament) => void;
  onDeleted: (tournament: Tournament) => void;
};

/**
 * FileOrLinkField — общее поле «ссылка ⇄ файл» для регламента и эмблемы
 * турнира (спека 0042, T39, FR-30/FR-31/FR-34). Загруженный файл вытесняет
 * ссылку: пока `file.url` пуст — обычный `Input type="url"` (прежнее
 * поведение) рядом с кнопкой загрузки; как только файл загружен — карточка
 * «имя + размер + Удалить» вместо инпута ссылки (источник ровно один).
 *
 * Загрузка и удаление — не часть черновика формы (`TournamentDraft`): у них
 * свой RPC (`UploadTournamentFile`/`DeleteTournamentFile`) и свой BFF-роут,
 * поэтому вызываются напрямую отсюда, а не через `onChange` формы —
 * результат (актуальный `Tournament`) поднимается наверх колбэками
 * `onUploaded`/`onDeleted`.
 */
export function FileOrLinkField({
  label,
  urlValue,
  onUrlChange,
  file,
  kind,
  accept,
  maxBytes,
  showPreview = false,
  onUploaded,
  onDeleted,
}: FileOrLinkFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputId = `file-or-link-${kind}-url`;
  const fileInputLabel = `Загрузить файл: ${label}`;

  const allowedTypes = accept
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    // Сбрасывает value — иначе повторный выбор ТОГО ЖЕ файла (после отказа
    // по типу/размеру) не породил бы новое событие change.
    e.target.value = "";
    if (!selected) return;

    if (allowedTypes.length > 0 && !allowedTypes.includes(selected.type)) {
      toastError(`Недопустимый тип файла. Допустимо: ${ACCEPTED_TYPE_LABELS[kind]}.`);
      return;
    }
    if (selected.size > maxBytes) {
      toastError(`Файл слишком большой. Максимум — ${formatFileSize(maxBytes)}.`);
      return;
    }

    setUploading(true);
    try {
      const res = await uploadTournamentFileRequest(kind, selected);
      if (!res.ok) {
        toastError(uploadFileErrorMessage(res.status));
        return;
      }
      onUploaded(res.tournament);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await deleteTournamentFileRequest(kind);
      if (!res.ok) {
        toastError(uploadFileErrorMessage(res.status));
        return;
      }
      onDeleted(res.tournament);
    } finally {
      setDeleting(false);
    }
  }

  const previewSrc = showPreview ? resolveFileOrLink(file, urlValue) : "";

  return (
    <Col gap={2}>
      {file.url ? (
        <>
          <Label>{label}</Label>
          <Row align="center" gap={3}>
            {showPreview && <EmblemThumb src={previewSrc} />}
            <Col gap={0} className="flex-1 min-w-0">
              <span className="truncate text-sm">{file.name || "Файл"}</span>
              <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
            </Col>
            <Button type="button" variant="outline" size="sm" loading={deleting} onClick={handleDelete}>
              Удалить
            </Button>
          </Row>
        </>
      ) : (
        <>
          <Label htmlFor={urlInputId}>{label}</Label>
          <Row align="center" gap={3}>
            {showPreview && <EmblemThumb src={previewSrc} />}
            <Input
              id={urlInputId}
              type="url"
              value={urlValue}
              onChange={(e) => onUrlChange(e.target.value)}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              Загрузить файл
            </Button>
          </Row>
          <p className="text-xs text-muted-foreground">
            Допустимо: {ACCEPTED_TYPE_LABELS[kind]}, до {formatFileSize(maxBytes)}. Загруженный
            файл заменит ссылку.
          </p>
        </>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        aria-label={fileInputLabel}
        className="sr-only"
        onChange={handleFileSelect}
      />
    </Col>
  );
}

/**
 * EmblemThumb — миниатюра эмблемы рядом с полем (spec 0029 FR-13, перенесена
 * из `tournament-settings-form.tsx`/`EmblemPreview` и адаптирована под уже
 * резолвленный источник — файл или ссылка, а не только URL): пустой или
 * недоступный адрес даёт нейтральную заглушку вместо битой картинки.
 */
function EmblemThumb({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  const trimmed = src.trim();
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

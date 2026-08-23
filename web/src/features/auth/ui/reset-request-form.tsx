"use client";

import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Col } from "@/shared/ui/stack";
import { useRequestPasswordReset } from "../api/use-request-password-reset";
import type { AuthMode } from "../api/requests";

/**
 * ResetRequestForm — режим «Сброс пароля» модалки входа (spec 0038,
 * FR-8/AC-4). Ответ сервера одинаков независимо от существования аккаунта
 * (0037, FR-2) — компонент никогда не показывает «такого email нет»: после
 * отправки — только постоянное подтверждение, форма исчезает.
 */
export function ResetRequestForm({
  setMode,
}: {
  setMode: (mode: AuthMode) => void;
}) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const requestReset = useRequestPasswordReset();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    requestReset.mutate(email, {
      onSuccess: () => setSentTo(email),
    });
  }

  const backLink = (
    <Button
      type="button"
      variant="link"
      className="h-auto justify-start p-0 text-xs"
      onClick={() => setMode("login")}
    >
      Вернуться ко входу
    </Button>
  );

  if (sentTo) {
    return (
      <Col gap={4}>
        <Alert>
          <AlertDescription>
            Письмо отправлено на {sentTo}. Ссылка живёт 30 минут — если не
            пришло, проверьте спам.
          </AlertDescription>
        </Alert>
        {backLink}
      </Col>
    );
  }

  const error = requestReset.error?.message ?? null;

  return (
    <Col as="form" onSubmit={onSubmit} gap={4}>
      <Col gap={2}>
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
          type="email"
          placeholder="ivan@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </Col>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" loading={requestReset.isPending} className="w-full">
        {requestReset.isPending ? "Отправляем…" : "Отправить ссылку"}
      </Button>
      {backLink}
    </Col>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { passwordHint } from "@/entities/user/lib/password";
import { useResetPassword } from "@/features/auth/api/use-reset-password";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Col } from "@/shared/ui/stack";
import { PasswordHint } from "@/entities/user/ui/password-hint";

/**
 * ResetPasswordForm — «новый пароль + подтверждение» для страницы по
 * ссылке из письма (spec 0038, FR-10..FR-12). Локальная проверка длины
 * (passwordHint, FR-6/FR-10) и совпадения подтверждения — до отправки;
 * сервер всё равно перепроверяет. Любая ошибка отправки (истёкшая/
 * использованная/битая ссылка — сервер не различает причины, 0037 FR-8)
 * трактуется вызывающим экраном как недействительная ссылка (`onInvalidToken`).
 */
export function ResetPasswordForm({
  token,
  onSuccess,
  onInvalidToken,
}: {
  token: string;
  onSuccess: () => void;
  onInvalidToken: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const resetPassword = useResetPassword();
  const hint = passwordHint(password);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hint.ok) {
      return;
    }
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    resetPassword.mutate(
      { token, password },
      { onSuccess, onError: onInvalidToken },
    );
  }

  return (
    <Col as="form" onSubmit={onSubmit} gap={4}>
      <Col gap={2}>
        <Label htmlFor="new-password">Новый пароль</Label>
        <Input
          id="new-password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (mismatch) setMismatch(false);
          }}
          required
          autoComplete="new-password"
        />
        {password.length > 0 && <PasswordHint value={password} />}
      </Col>
      <Col gap={2}>
        <Label htmlFor="confirm-password">Повторите пароль</Label>
        <Input
          id="confirm-password"
          type="password"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (mismatch) setMismatch(false);
          }}
          required
          autoComplete="new-password"
          aria-invalid={mismatch || undefined}
        />
        {mismatch && (
          <p className="text-xs text-destructive">Пароли не совпадают</p>
        )}
      </Col>
      {resetPassword.isPending === false && resetPassword.error && (
        // Отдельная строка не нужна: неудача перебрасывает экран целиком в
        // «ссылка недействительна» (onInvalidToken) — этот блок не должен
        // успевать отрендериться в обычном потоке, оставлен как страховка.
        <Alert variant="destructive">
          <AlertDescription>{resetPassword.error.message}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        loading={resetPassword.isPending}
        className="w-full"
      >
        {resetPassword.isPending ? "Устанавливаем…" : "Установить пароль"}
      </Button>
    </Col>
  );
}

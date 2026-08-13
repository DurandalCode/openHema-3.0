"use client";

import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Col } from "@/shared/ui/stack";
import { useCreateAdmin } from "../api/use-create-admin";
import type { AdminUser } from "../api/requests";

type FieldErrors = Partial<Record<"displayName" | "email" | "password", string>>;

function validate(displayName: string, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!displayName.trim()) errors.displayName = "Введите имя";
  if (!email.trim()) errors.email = "Введите email";
  else if (!email.includes("@")) errors.email = "Некорректный email";
  if (!password) errors.password = "Введите пароль";
  return errors;
}

/**
 * CreateAdminDialog — создание нового админа модалкой поверх списка (FR-14),
 * без ухода со страницы. Открытость управляется извне (`UsersScreen` —
 * действие «+ Создать админа» в шапке раздела, FR-18); диалог сам знает
 * только форму и обратную связь:
 * - незаполненные/некорректные поля — инлайн у поля (FR-15);
 * - ошибка сервера (email занят и т.п.) — внутри модалки, которая остаётся
 *   открытой с введёнными данными, а не тостом поверх закрывшегося окна
 *   (FR-15, AC-11);
 * - успех — закрывает модалку и сообщает наверх созданного пользователя
 *   (FR-16, AC-10); тост об успехе — забота вызывающей стороны (`UsersScreen`),
 *   а не диалога, чтобы правило канала обратной связи (0023) не дублировалось.
 */
export function CreateAdminDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (user: AdminUser) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const create = useCreateAdmin();

  function reset() {
    setDisplayName("");
    setEmail("");
    setPassword("");
    setFieldErrors({});
    create.reset();
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) reset();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errors = validate(displayName, email, password);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    create.mutate(
      { displayName, email, password },
      {
        onSuccess: (user) => {
          onOpenChange(false);
          onCreated?.(user);
          reset();
        },
      },
    );
  }

  const serverError = create.error?.message ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый админ</DialogTitle>
          <DialogDescription>
            Ролей всего две — здесь сразу заводится ADMIN. Повышение и
            понижение обычных пользователей делается кнопками в списке.
          </DialogDescription>
        </DialogHeader>
        <Col as="form" onSubmit={onSubmit} noValidate gap={4}>
          <Col gap={2}>
            <Label htmlFor="create-admin-name">Имя</Label>
            <Input
              id="create-admin-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              aria-invalid={fieldErrors.displayName ? true : undefined}
              autoComplete="name"
            />
            {fieldErrors.displayName && (
              <p className="text-xs text-destructive">{fieldErrors.displayName}</p>
            )}
          </Col>

          <Col gap={2}>
            <Label htmlFor="create-admin-email">Email</Label>
            <Input
              id="create-admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={fieldErrors.email ? true : undefined}
              autoComplete="email"
            />
            {fieldErrors.email && (
              <p className="text-xs text-destructive">{fieldErrors.email}</p>
            )}
          </Col>

          <Col gap={2}>
            <Label htmlFor="create-admin-password">Пароль</Label>
            <Input
              id="create-admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={fieldErrors.password ? true : undefined}
              autoComplete="new-password"
            />
            {fieldErrors.password && (
              <p className="text-xs text-destructive">{fieldErrors.password}</p>
            )}
          </Col>

          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" loading={create.isPending}>
              Создать админа
            </Button>
          </DialogFooter>
        </Col>
      </DialogContent>
    </Dialog>
  );
}

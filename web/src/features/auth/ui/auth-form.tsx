"use client";

import { useState, type FormEvent } from "react";
import { passwordHint } from "@/entities/user/lib/password";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Col } from "@/shared/ui/stack";
import { useLogin } from "../api/use-login";
import { useRegister } from "../api/use-register";
import { PasswordHint } from "./password-hint";

/** AuthForm — форма входа/регистрации на shadcn-примитивах + useMutation. */
export function AuthForm({
  mode,
  onSuccess,
}: {
  mode: "login" | "register";
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPasswordRule, setShowPasswordRule] = useState(false);

  const isRegister = mode === "register";
  const login = useLogin(onSuccess);
  const register = useRegister(onSuccess);
  const mutation = isRegister ? register : login;
  const hint = passwordHint(password);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isRegister) {
      if (!hint.ok) {
        setShowPasswordRule(true);
        return;
      }
      register.mutate({ email, password, displayName });
    } else {
      login.mutate({ email, password });
    }
  }

  const error = mutation.error?.message ?? null;
  const submitLabel = isRegister
    ? mutation.isPending
      ? "Создаём аккаунт…"
      : "Зарегистрироваться"
    : mutation.isPending
      ? "Входим…"
      : "Войти";

  return (
    <Col as="form" onSubmit={onSubmit} gap={4}>
      {isRegister && (
        <Col gap={2}>
          <Label htmlFor="display-name">Имя</Label>
          <Input
            id="display-name"
            placeholder="Иван"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoComplete="name"
          />
          <p className="text-xs text-caption-foreground">
            Так вас увидят в сетке и на табло.
          </p>
        </Col>
      )}
      <Col gap={2}>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="ivan@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </Col>
      <Col gap={2}>
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (showPasswordRule) setShowPasswordRule(false);
          }}
          required
          autoComplete={isRegister ? "new-password" : "current-password"}
          aria-invalid={isRegister && showPasswordRule ? true : undefined}
        />
        {isRegister && (showPasswordRule || password.length > 0) && (
          <PasswordHint value={password} />
        )}
      </Col>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" loading={mutation.isPending} className="w-full">
        {submitLabel}
      </Button>
      {isRegister && (
        <p className="text-xs text-caption-foreground">
          Регистрация даёт учётную запись; бойцом на турнире вы становитесь
          после того, как организатор зарегистрирует вашу заявку.
        </p>
      )}
    </Col>
  );
}

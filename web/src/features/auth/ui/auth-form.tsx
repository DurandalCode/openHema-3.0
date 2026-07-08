"use client";

import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Col } from "@/shared/ui/stack";
import { useLogin } from "../api/use-login";
import { useRegister } from "../api/use-register";
import type { AuthMode } from "../api/requests";

/** AuthForm — форма входа/регистрации на shadcn-примитивах + useMutation. */
export function AuthForm({
  mode,
  onSuccess,
}: {
  mode: AuthMode;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const isRegister = mode === "register";
  const login = useLogin(onSuccess);
  const register = useRegister(onSuccess);
  const mutation = isRegister ? register : login;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isRegister) {
      register.mutate({ email, password, displayName });
    } else {
      login.mutate({ email, password });
    }
  }

  const error = mutation.error?.message ?? null;

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
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete={isRegister ? "new-password" : "current-password"}
        />
      </Col>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" loading={mutation.isPending} className="w-full">
        {isRegister ? "Зарегистрироваться" : "Войти"}
      </Button>
    </Col>
  );
}

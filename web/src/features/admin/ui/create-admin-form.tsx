"use client";

import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Col } from "@/shared/ui/stack";
import { useCreateAdmin } from "../api/use-create-admin";

/** CreateAdminForm — форма создания нового администратора. */
export function CreateAdminForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const create = useCreateAdmin();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate({ email, password, displayName });
  }

  const error = create.error?.message ?? null;

  return (
    <Col as="form" onSubmit={onSubmit} gap={4}>
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
          autoComplete="new-password"
        />
      </Col>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" loading={create.isPending}>
        Создать админа
      </Button>
    </Col>
  );
}

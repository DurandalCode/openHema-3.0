"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
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
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="display-name">Имя</Label>
        <Input
          id="display-name"
          placeholder="Иван"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          autoComplete="name"
        />
      </div>
      <div className="grid gap-2">
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
      </div>
      <div className="grid gap-2">
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
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "…" : "Создать админа"}
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">Назад</Link>
        </Button>
      </div>
    </form>
  );
}

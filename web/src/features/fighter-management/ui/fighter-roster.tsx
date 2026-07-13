"use client";

import { useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Col, Row } from "@/shared/ui/stack";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { WithdrawalReason } from "@/entities/fighter/lib/types";
import { useRoster } from "../api/use-roster";
import {
  useAddToNomination,
  useCreateFighter,
  useEditFighter,
  useRemoveFromNomination,
  useReturnFighter,
  useWithdrawFighter,
} from "../api/use-fighter-mutations";

const REASON_OPTIONS: { value: WithdrawalReason; label: string }[] = [
  { value: "WITHDRAWAL_REASON_INJURY", label: "Травма" },
  { value: "WITHDRAWAL_REASON_BAN", label: "Бан" },
  { value: "WITHDRAWAL_REASON_OTHER", label: "Иное" },
];

function nominationTitle(nominations: Nomination[], id: string): string {
  return nominations.find((n) => n.id === id)?.title ?? id;
}

/**
 * FighterRoster — ростер турнира (admin, спека 0007): ручное заведение
 * бойца, вывод/возврат с турнира, снятие/добавление участия в номинации.
 * Отдельно от воронки заявок (application-review) — боец не завязан на
 * заявку после регистрации (спека 0007, п.9 «Принятые решения»).
 */
export function FighterRoster({
  tournamentId,
  nominations,
}: {
  tournamentId: string;
  nominations: Nomination[];
}) {
  const { data: fighters = [], isLoading, error } = useRoster(tournamentId);
  const createFighter = useCreateFighter();
  const editFighter = useEditFighter();
  const withdrawFighter = useWithdrawFighter();
  const returnFighter = useReturnFighter();
  const addToNomination = useAddToNomination();
  const removeFromNomination = useRemoveFromNomination();

  const [name, setName] = useState("");
  const [club, setClub] = useState("");
  const [selectedNominations, setSelectedNominations] = useState<Set<string>>(new Set());
  const [reasonByFighter, setReasonByFighter] = useState<Record<string, WithdrawalReason>>({});
  const [addNominationByFighter, setAddNominationByFighter] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, { name: string; club: string }>>({});

  const sortedFighters = useMemo(
    () => [...fighters].sort((a, b) => a.name.localeCompare(b.name)),
    [fighters],
  );

  function toggleNomination(id: string) {
    setSelectedNominations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreate() {
    if (!name.trim()) return;
    createFighter.mutate(
      { tournamentId, name, club, nominationIds: [...selectedNominations] },
      {
        onSuccess: () => {
          setName("");
          setClub("");
          setSelectedNominations(new Set());
        },
      },
    );
  }

  return (
    <Col gap={6}>
      <Card>
        <CardContent className="pt-6">
          <Col gap={4}>
            <h3 className="text-sm font-medium">Завести бойца вручную</h3>
            <Row gap={3} wrap>
              <Input
                placeholder="Имя"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="max-w-xs"
              />
              <Input
                placeholder="Клуб (необязательно)"
                value={club}
                onChange={(e) => setClub(e.target.value)}
                className="max-w-xs"
              />
            </Row>
            {nominations.length > 0 && (
              <Row gap={4} wrap>
                {nominations.map((n) => (
                  <Row key={n.id} align="center" gap={2}>
                    <Checkbox
                      id={`create-nom-${n.id}`}
                      checked={selectedNominations.has(n.id)}
                      onCheckedChange={() => toggleNomination(n.id)}
                    />
                    <Label htmlFor={`create-nom-${n.id}`} className="font-normal">
                      {n.title}
                    </Label>
                  </Row>
                ))}
              </Row>
            )}
            {createFighter.isError && (
              <Alert variant="destructive">
                <AlertDescription>{(createFighter.error as Error).message}</AlertDescription>
              </Alert>
            )}
            <Row>
              <Button onClick={handleCreate} disabled={createFighter.isPending || !name.trim()}>
                Завести бойца
              </Button>
            </Row>
          </Col>
        </CardContent>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      <Col gap={3}>
        {sortedFighters.map((f) => {
          const isWithdrawn = f.status === "FIGHTER_STATUS_WITHDRAWN";
          const editState = editing[f.id];
          return (
            <Card key={f.id}>
              <CardContent className="pt-6">
                <Col gap={3}>
                  <Row align="center" gap={3} wrap>
                    {editState ? (
                      <>
                        <Input
                          value={editState.name}
                          onChange={(e) =>
                            setEditing((prev) => ({
                              ...prev,
                              [f.id]: { ...editState, name: e.target.value },
                            }))
                          }
                          className="max-w-xs"
                        />
                        <Input
                          value={editState.club}
                          onChange={(e) =>
                            setEditing((prev) => ({
                              ...prev,
                              [f.id]: { ...editState, club: e.target.value },
                            }))
                          }
                          className="max-w-xs"
                        />
                        <Button
                          size="sm"
                          disabled={editFighter.isPending}
                          onClick={() =>
                            editFighter.mutate(
                              { fighterId: f.id, name: editState.name, club: editState.club },
                              {
                                onSuccess: () =>
                                  setEditing((prev) => {
                                    const next = { ...prev };
                                    delete next[f.id];
                                    return next;
                                  }),
                              },
                            )
                          }
                        >
                          Сохранить
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditing((prev) => {
                              const next = { ...prev };
                              delete next[f.id];
                              return next;
                            })
                          }
                        >
                          Отмена
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="font-medium">{f.name}</span>
                        {f.club && <span className="text-sm text-muted-foreground">{f.club}</span>}
                        <Badge variant={isWithdrawn ? "outline" : "gold"}>
                          {isWithdrawn ? "Выбыл" : "Активен"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing((prev) => ({ ...prev, [f.id]: { name: f.name, club: f.club } }))}
                        >
                          Править
                        </Button>
                      </>
                    )}
                  </Row>

                  <Col gap={2}>
                    {f.participations.map((p) => (
                      <Row key={p.nominationId} align="center" gap={2}>
                        <span className="text-sm">{nominationTitle(nominations, p.nominationId)}</span>
                        <Badge variant="outline">
                          {p.status === "PARTICIPATION_STATUS_ACTIVE" ? "участвует" : "снят"}
                        </Badge>
                        {p.status === "PARTICIPATION_STATUS_ACTIVE" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={removeFromNomination.isPending}
                            onClick={() =>
                              removeFromNomination.mutate({
                                fighterId: f.id,
                                nominationId: p.nominationId,
                              })
                            }
                          >
                            Снять
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={addToNomination.isPending}
                            onClick={() =>
                              addToNomination.mutate({
                                fighterId: f.id,
                                nominationId: p.nominationId,
                              })
                            }
                          >
                            Вернуть
                          </Button>
                        )}
                      </Row>
                    ))}
                  </Col>

                  <Row align="center" gap={2} wrap>
                    <Select
                      value={addNominationByFighter[f.id] ?? ""}
                      onValueChange={(v) =>
                        setAddNominationByFighter((prev) => ({ ...prev, [f.id]: v }))
                      }
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Добавить в номинацию" />
                      </SelectTrigger>
                      <SelectContent>
                        {nominations.map((n) => (
                          <SelectItem key={n.id} value={n.id}>
                            {n.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!addNominationByFighter[f.id] || addToNomination.isPending}
                      onClick={() => {
                        const nominationId = addNominationByFighter[f.id];
                        if (!nominationId) return;
                        addToNomination.mutate(
                          { fighterId: f.id, nominationId },
                          {
                            onSuccess: () =>
                              setAddNominationByFighter((prev) => ({ ...prev, [f.id]: "" })),
                          },
                        );
                      }}
                    >
                      Добавить
                    </Button>
                  </Row>

                  <Row align="center" gap={2} wrap>
                    {isWithdrawn ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={returnFighter.isPending}
                        onClick={() => returnFighter.mutate(f.id)}
                      >
                        Вернуть на турнир
                      </Button>
                    ) : (
                      <>
                        <Select
                          value={reasonByFighter[f.id] ?? ""}
                          onValueChange={(v) =>
                            setReasonByFighter((prev) => ({
                              ...prev,
                              [f.id]: v as WithdrawalReason,
                            }))
                          }
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Причина вывода" />
                          </SelectTrigger>
                          <SelectContent>
                            {REASON_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!reasonByFighter[f.id] || withdrawFighter.isPending}
                          onClick={() => {
                            const reason = reasonByFighter[f.id];
                            if (!reason) return;
                            withdrawFighter.mutate({ fighterId: f.id, reason });
                          }}
                        >
                          Вывести с турнира
                        </Button>
                      </>
                    )}
                  </Row>
                </Col>
              </CardContent>
            </Card>
          );
        })}
        {!isLoading && sortedFighters.length === 0 && (
          <p className="text-sm text-muted-foreground">Бойцов пока нет.</p>
        )}
      </Col>
    </Col>
  );
}

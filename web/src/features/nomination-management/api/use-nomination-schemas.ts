"use client";

import { useQuery } from "@tanstack/react-query";
import type { SchemaIssue, Stage } from "@/entities/stage/lib/types";
import { nominationManagementKeys } from "./keys";
import { listNominationSchemasRequest } from "./requests";

export type NominationSchema = {
  stages: Stage[];
  issues: SchemaIssue[];
  isError: boolean;
};

/**
 * useNominationSchemas — схема этапов + диагностика для списка номинаций
 * турнира (спека 0028, FR-5/FR-6). С 0041 (FR-8/FR-10) — один агрегирующий
 * запрос `GET /api/tournaments/[id]/nomination-schemas` за один цикл вместо
 * одного запроса этапов на каждую номинацию (0028, NFR-2 — «вернуться, если
 * число запросов станет узким местом», теперь реализовано). Охват совпадает
 * с `useNominations`: сервер резолвит список номинаций тем же портом
 * `NominationProvider.NominationsByTournament` (спека 0034), что и
 * `GetTournamentLive` — расхождений между показанными номинациями и
 * полученными схемами быть не должно. Без `refetchInterval`, как и раньше:
 * схема — холодные данные, обновляются мутациями, не таймером (FR-10).
 *
 * Обработка ошибок: агрегирующий RPC `ListStagesForTournament` либо целиком
 * успевает, либо целиком падает (`retry: false`) — то же решение и то же
 * обоснование, что на сервере в `server/modules/stage/service/
 * stage_aggregates.go` (`ListStagesForTournament`): все номинации турнира
 * читаются последовательно в одном запросе поверх одного и того же
 * порта/хранилища, единственный реалистичный источник ошибки чтения схемы
 * ОДНОЙ номинации здесь — тот же отказ сети/сервера, что уронил бы и чтение
 * схемы остальных номинаций этого же запроса, а не что-то специфичное для
 * одной номинации. В отличие от прежней версии на `useQueries` (по
 * независимому HTTP-запросу на номинацию) клиент больше не знает полный
 * список id номинаций заранее (сигнатура сузилась до `tournamentId` — он не
 * нужен, сервер сам резолвит список), поэтому при отказе всего запроса карта
 * возвращается пустой: `NominationsTable`/`SchemaCell` читают
 * `schemas.get(id)` как `undefined` и показывают тот же вид «—», что и до
 * первого ответа, а не отдельное «схема недоступна» на каждой строке. Флаг
 * `isError` на `NominationSchema` сохранён в типе ради сигнатуры (вызывающий
 * код её не меняет) — при успехе запроса он всегда `false`, поскольку записи
 * в карте появляются только вместе с успешным ответом целиком.
 */
export function useNominationSchemas(tournamentId: string): Map<string, NominationSchema> {
  const query = useQuery({
    queryKey: nominationManagementKeys.schemas(tournamentId),
    queryFn: async () => {
      const res = await listNominationSchemasRequest(tournamentId);
      if (!res.ok) throw new Error(res.error);
      return res.entries;
    },
    staleTime: 60_000,
    retry: false,
  });

  const map = new Map<string, NominationSchema>();
  for (const entry of query.data ?? []) {
    map.set(entry.nominationId, { stages: entry.stages, issues: entry.issues, isError: false });
  }
  return map;
}

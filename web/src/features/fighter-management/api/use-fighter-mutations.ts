"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addToNominationRequest,
  createFighterRequest,
  editFighterRequest,
  moveFighterRequest,
  removeFromNominationRequest,
  returnFighterRequest,
  withdrawFighterRequest,
  type CreateFighterInput,
} from "./requests";
import type { WithdrawalReason } from "@/entities/fighter/lib/types";

/**
 * Мутации ростера бойцов (admin, спека 0007). Каждая — простое, широкое
 * invalidate всего среза `fighter-management` (как в application-review) —
 * ростер небольшой, точечная инвалидация не оправдана.
 */
function useFighterMutation<TArgs, TResult>(
  mutationFn: (args: TArgs) => Promise<{ ok: true; fighter: TResult } | { ok: false; error: string }>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: TArgs) => {
      const res = await mutationFn(args);
      if (!res.ok) throw new Error(res.error);
      return res.fighter;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fighter-management"] });
    },
  });
}

export function useCreateFighter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateFighterInput) => {
      const res = await createFighterRequest(input);
      if (!res.ok) throw new Error(res.error);
      return res.fighter;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fighter-management"] });
    },
  });
}

export function useEditFighter() {
  return useFighterMutation<{ fighterId: string; name: string; club: string }, unknown>(
    ({ fighterId, name, club }) => editFighterRequest(fighterId, name, club),
  );
}

export function useWithdrawFighter() {
  return useFighterMutation<{ fighterId: string; reason: WithdrawalReason }, unknown>(
    ({ fighterId, reason }) => withdrawFighterRequest(fighterId, reason),
  );
}

export function useReturnFighter() {
  return useFighterMutation<string, unknown>((fighterId) => returnFighterRequest(fighterId));
}

export function useAddToNomination() {
  return useFighterMutation<{ fighterId: string; nominationId: string }, unknown>(
    ({ fighterId, nominationId }) => addToNominationRequest(fighterId, nominationId),
  );
}

export function useRemoveFromNomination() {
  return useFighterMutation<{ fighterId: string; nominationId: string }, unknown>(
    ({ fighterId, nominationId }) => removeFromNominationRequest(fighterId, nominationId),
  );
}

export function useMoveFighter() {
  return useFighterMutation<
    { fighterId: string; fromNominationId: string; toNominationId: string },
    unknown
  >(({ fighterId, fromNominationId, toNominationId }) =>
    moveFighterRequest(fighterId, fromNominationId, toNominationId),
  );
}

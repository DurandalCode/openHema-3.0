"use client";

import { useQuery } from "@tanstack/react-query";
import { getBoutBoardRequest } from "./requests";
import { boutBoardKeys } from "./keys";

/**
 * useBoutBoard — доска ведения боёв арены (спека 0013, FR-14): стоящий пул,
 * его бои по порядку и текущий бой. `null`, если на арене никто не стоит.
 * Питает экран ведения боёв на странице арены.
 */
export function useBoutBoard(arenaId: string) {
  return useQuery({
    queryKey: boutBoardKeys.board(arenaId),
    queryFn: async () => {
      const res = await getBoutBoardRequest(arenaId);
      if (!res.ok) throw new Error(res.error);
      return res.board;
    },
    enabled: arenaId.length > 0,
  });
}

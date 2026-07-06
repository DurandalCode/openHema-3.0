"use client";

import { useState, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  isServer,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { makeQueryClient } from "./query-client";

let browserQueryClient: QueryClient | undefined;

/**
 * getQueryClient — singleton в браузере, fresh instance на сервере.
 * Используется только в QueryProvider; для Server Components prefetch
 * создавай `makeQueryClient()` напрямую.
 */
function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

/**
 * QueryProvider — клиентский провайдер TanStack Query.
 * Монтируется в root layout. Devtools — только в development.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}

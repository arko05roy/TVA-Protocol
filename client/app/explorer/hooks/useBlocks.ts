"use client";

import { useQuery, useQueries } from "@tanstack/react-query";
import { getRpcClient } from "./useTvaRpc";
import type { EvmBlock } from "@tva-protocol/sdk/types";

/**
 * Hook to fetch a single block by number
 */
export function useBlock(blockNumber: number | null, includeTransactions: boolean = false) {
  return useQuery({
    queryKey: ["block", blockNumber, includeTransactions],
    queryFn: async () => {
      if (blockNumber === null) return null;
      const rpc = getRpcClient();
      const block = await rpc.getBlockByNumber(blockNumber, includeTransactions);
      return block;
    },
    enabled: blockNumber !== null,
  });
}

/**
 * Hook to fetch a block by hash
 */
export function useBlockByHash(blockHash: string | null, includeTransactions: boolean = false) {
  return useQuery({
    queryKey: ["blockByHash", blockHash, includeTransactions],
    queryFn: async () => {
      if (!blockHash) return null;
      const rpc = getRpcClient();
      const block = await rpc.getBlockByHash(blockHash, includeTransactions);
      return block;
    },
    enabled: !!blockHash,
  });
}

/**
 * Hook to fetch multiple recent blocks
 */
export function useRecentBlocks(latestBlockNumber: number | undefined, count: number = 10) {
  const blockNumbers = latestBlockNumber
    ? Array.from({ length: count }, (_, i) => latestBlockNumber - i).filter((n) => n >= 0)
    : [];

  const queries = useQueries({
    queries: blockNumbers.map((num) => ({
      queryKey: ["block", num, false],
      queryFn: async () => {
        const rpc = getRpcClient();
        return rpc.getBlockByNumber(num, false);
      },
      staleTime: Infinity, // Historical blocks don't change
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);
  const blocks = queries
    .map((q) => q.data)
    .filter((block): block is EvmBlock => block !== null && block !== undefined);

  return { blocks, isLoading, isError };
}

/**
 * Hook to fetch blocks for pagination
 */
export function useBlocksPage(startBlock: number, count: number = 10) {
  const blockNumbers = Array.from({ length: count }, (_, i) => startBlock - i).filter((n) => n >= 0);

  const queries = useQueries({
    queries: blockNumbers.map((num) => ({
      queryKey: ["block", num, false],
      queryFn: async () => {
        const rpc = getRpcClient();
        return rpc.getBlockByNumber(num, false);
      },
      staleTime: Infinity,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);
  const blocks = queries
    .map((q) => q.data)
    .filter((block): block is EvmBlock => block !== null && block !== undefined);

  return { blocks, isLoading, isError };
}

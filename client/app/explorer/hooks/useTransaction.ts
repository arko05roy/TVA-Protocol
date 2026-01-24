"use client";

import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "./useTvaRpc";
import type { EvmTransactionReceipt, EvmLog } from "@tva-protocol/sdk/types";

/**
 * Hook to fetch a transaction by hash
 */
export function useTransaction(txHash: string | null) {
  return useQuery({
    queryKey: ["transaction", txHash],
    queryFn: async () => {
      if (!txHash) return null;
      const rpc = getRpcClient();
      const tx = await rpc.getTransactionByHash(txHash);
      return tx;
    },
    enabled: !!txHash,
    staleTime: Infinity, // Transactions don't change once confirmed
  });
}

/**
 * Hook to fetch a transaction receipt
 */
export function useTransactionReceipt(txHash: string | null) {
  return useQuery({
    queryKey: ["transactionReceipt", txHash],
    queryFn: async () => {
      if (!txHash) return null;
      const rpc = getRpcClient();
      const receipt = await rpc.getTransactionReceipt(txHash);
      return receipt;
    },
    enabled: !!txHash,
    staleTime: Infinity,
  });
}

/**
 * Hook to fetch both transaction and receipt
 */
export function useTransactionWithReceipt(txHash: string | null) {
  const txQuery = useTransaction(txHash);
  const receiptQuery = useTransactionReceipt(txHash);

  return {
    transaction: txQuery.data,
    receipt: receiptQuery.data,
    isLoading: txQuery.isLoading || receiptQuery.isLoading,
    isError: txQuery.isError || receiptQuery.isError,
    error: txQuery.error || receiptQuery.error,
  };
}

/**
 * Hook to fetch logs for an address
 */
export function useLogs(
  address: string | null,
  fromBlock: number | "latest" = 0,
  toBlock: number | "latest" = "latest"
) {
  return useQuery({
    queryKey: ["logs", address, fromBlock, toBlock],
    queryFn: async () => {
      if (!address) return [];
      const rpc = getRpcClient();
      const logs = await rpc.getLogs({
        address: address as `0x${string}`,
        fromBlock,
        toBlock,
      });
      return logs;
    },
    enabled: !!address,
  });
}

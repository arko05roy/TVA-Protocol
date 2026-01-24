"use client";

import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "./useTvaRpc";
import { BLOCK_POLL_INTERVAL } from "../lib/constants";

/**
 * Hook to fetch and poll the latest block number
 */
export function useLatestBlock() {
  return useQuery({
    queryKey: ["latestBlock"],
    queryFn: async () => {
      const rpc = getRpcClient();
      const blockNumber = await rpc.getBlockNumber();
      return blockNumber;
    },
    refetchInterval: BLOCK_POLL_INTERVAL,
  });
}

/**
 * Hook to fetch the latest block with full details
 */
export function useLatestBlockDetail() {
  return useQuery({
    queryKey: ["latestBlockDetail"],
    queryFn: async () => {
      const rpc = getRpcClient();
      const block = await rpc.getBlockByNumber("latest", false);
      return block;
    },
    refetchInterval: BLOCK_POLL_INTERVAL,
  });
}

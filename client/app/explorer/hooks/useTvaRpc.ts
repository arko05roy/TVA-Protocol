"use client";

import { useMemo } from "react";
import { createRpcClient, RpcClient } from "@tva-protocol/sdk/rpc";
import { DEFAULT_RPC_URL } from "../lib/constants";

/**
 * Hook to get a singleton RPC client instance
 */
export function useTvaRpc(): RpcClient {
  const rpc = useMemo(() => {
    return createRpcClient(DEFAULT_RPC_URL);
  }, []);

  return rpc;
}

/**
 * Get RPC client instance (non-hook version for server components or callbacks)
 */
let _rpcClient: RpcClient | null = null;

export function getRpcClient(): RpcClient {
  if (!_rpcClient) {
    _rpcClient = createRpcClient(DEFAULT_RPC_URL);
  }
  return _rpcClient;
}

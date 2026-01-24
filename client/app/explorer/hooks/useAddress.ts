"use client";

import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "./useTvaRpc";
import { getAccountType } from "../lib/formatter";

export interface AddressData {
  address: string;
  balance: bigint;
  nonce: number;
  code: string;
  accountType: "EOA" | "Contract";
}

/**
 * Hook to fetch address data (balance, nonce, code)
 */
export function useAddress(address: string | null) {
  return useQuery({
    queryKey: ["address", address],
    queryFn: async (): Promise<AddressData | null> => {
      if (!address) return null;
      const rpc = getRpcClient();

      const [balance, nonce, code] = await Promise.all([
        rpc.getBalance(address as `0x${string}`),
        rpc.getTransactionCount(address as `0x${string}`),
        rpc.getCode(address as `0x${string}`),
      ]);

      return {
        address,
        balance,
        nonce,
        code,
        accountType: getAccountType(code),
      };
    },
    enabled: !!address,
  });
}

/**
 * Hook to fetch just balance
 */
export function useBalance(address: string | null) {
  return useQuery({
    queryKey: ["balance", address],
    queryFn: async () => {
      if (!address) return null;
      const rpc = getRpcClient();
      return rpc.getBalance(address as `0x${string}`);
    },
    enabled: !!address,
  });
}

/**
 * Hook to fetch transaction count (nonce)
 */
export function useTransactionCount(address: string | null) {
  return useQuery({
    queryKey: ["transactionCount", address],
    queryFn: async () => {
      if (!address) return null;
      const rpc = getRpcClient();
      return rpc.getTransactionCount(address as `0x${string}`);
    },
    enabled: !!address,
  });
}

/**
 * Hook to check if address is a contract
 */
export function useIsContract(address: string | null) {
  return useQuery({
    queryKey: ["isContract", address],
    queryFn: async () => {
      if (!address) return false;
      const rpc = getRpcClient();
      const code = await rpc.getCode(address as `0x${string}`);
      return getAccountType(code) === "Contract";
    },
    enabled: !!address,
  });
}

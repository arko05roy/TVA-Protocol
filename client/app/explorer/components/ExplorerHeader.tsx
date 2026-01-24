"use client";

import Link from "next/link";
import { useLatestBlock } from "../hooks/useLatestBlock";
import { SearchBar } from "./SearchBar";
import { TVA_CHAIN_ID } from "../lib/constants";
import { formatBlockNumberHex } from "../lib/formatter";

export function ExplorerHeader() {
  const { data: latestBlock, isLoading } = useLatestBlock();

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-black/5">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-6">
          {/* Logo & Title */}
          <Link href="/explorer" className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-black flex items-center justify-center">
              <span className="text-white font-bold text-sm font-mono">T</span>
            </div>
            <div>
              <span className="font-semibold text-lg tracking-tight">TVA Explorer</span>
              <span className="hidden sm:inline text-xs text-black/40 font-mono ml-2">
                Chain {TVA_CHAIN_ID}
              </span>
            </div>
          </Link>

          {/* Search Bar */}
          <div className="flex-1 max-w-xl hidden md:block">
            <SearchBar />
          </div>

          {/* Network Status */}
          <div className="flex items-center gap-4 shrink-0">
            {/* Latest Block */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-black/5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-mono text-black/60">
                {isLoading ? (
                  "..."
                ) : latestBlock ? (
                  <>
                    Block{" "}
                    <Link
                      href={`/explorer/blocks/${latestBlock}`}
                      className="text-[#0055ff] hover:underline"
                    >
                      {latestBlock.toLocaleString()}
                    </Link>
                  </>
                ) : (
                  "Connecting..."
                )}
              </span>
            </div>

            {/* Network Badge */}
            <div className="px-3 py-2 rounded-lg border border-[#0055ff]/20 bg-[#0055ff]/5">
              <span className="text-sm font-medium text-[#0055ff]">Testnet</span>
            </div>
          </div>
        </div>

        {/* Mobile Search */}
        <div className="mt-4 md:hidden">
          <SearchBar />
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { ExplorerHeader } from "./components/ExplorerHeader";
import { BlockCard } from "./components/BlockCard";
import { SearchBar } from "./components/SearchBar";
import { useLatestBlock } from "./hooks/useLatestBlock";
import { useRecentBlocks } from "./hooks/useBlocks";
import { TVA_CHAIN_ID, MAX_RECENT_BLOCKS } from "./lib/constants";
import { formatBlockNumberHex } from "./lib/formatter";

export default function ExplorerHome() {
  const { data: latestBlockNumber, isLoading: isLoadingLatest } = useLatestBlock();
  const { blocks, isLoading: isLoadingBlocks } = useRecentBlocks(
    latestBlockNumber,
    MAX_RECENT_BLOCKS
  );

  return (
    <div className="min-h-screen bg-white">
      <ExplorerHeader />

      {/* Hero Section */}
      <div className="bg-gradient-to-b from-[#0055ff]/5 to-transparent">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              TVA Block Explorer
            </h1>
            <p className="text-lg text-black/60 mb-8">
              Explore blocks, transactions, and addresses on the TVA Protocol.
              View data in both Stellar and EVM formats.
            </p>
            <SearchBar className="max-w-xl" />
          </div>
        </div>
      </div>

      {/* Network Stats */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl border border-black/10 bg-white">
            <div className="text-sm text-black/40 uppercase tracking-wider mb-1">Latest Block</div>
            <div className="text-2xl font-bold font-mono">
              {isLoadingLatest ? (
                <span className="animate-pulse bg-black/10 rounded w-24 h-8 inline-block" />
              ) : latestBlockNumber ? (
                <Link href={`/explorer/blocks/${latestBlockNumber}`} className="text-[#0055ff] hover:underline">
                  {latestBlockNumber.toLocaleString()}
                </Link>
              ) : (
                "—"
              )}
            </div>
          </div>

          <div className="p-5 rounded-xl border border-black/10 bg-white">
            <div className="text-sm text-black/40 uppercase tracking-wider mb-1">Chain ID</div>
            <div className="text-2xl font-bold font-mono">{TVA_CHAIN_ID}</div>
            <div className="text-xs text-black/40 font-mono mt-1">
              0x{TVA_CHAIN_ID.toString(16).toUpperCase()}
            </div>
          </div>

          <div className="p-5 rounded-xl border border-black/10 bg-white">
            <div className="text-sm text-black/40 uppercase tracking-wider mb-1">Network</div>
            <div className="text-2xl font-bold">Testnet</div>
            <div className="text-xs text-black/40 mt-1">Stellar Test Network</div>
          </div>

          <div className="p-5 rounded-xl border border-black/10 bg-white">
            <div className="text-sm text-black/40 uppercase tracking-wider mb-1">Block Time</div>
            <div className="text-2xl font-bold">~5s</div>
            <div className="text-xs text-black/40 mt-1">Deterministic finality</div>
          </div>
        </div>
      </div>

      {/* Recent Blocks */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Recent Blocks</h2>
          <Link
            href="/explorer/blocks"
            className="text-sm text-[#0055ff] hover:underline flex items-center gap-1"
          >
            View all blocks
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {isLoadingBlocks ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-black/5 animate-pulse" />
            ))}
          </div>
        ) : blocks.length === 0 ? (
          <div className="text-center py-12 text-black/40">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p>No blocks found</p>
            <p className="text-sm mt-1">Make sure the TVA RPC server is running</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-black/10 divide-y divide-black/5">
            {blocks.map((block) => (
              <BlockCard key={block.number} block={block} compact />
            ))}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="max-w-7xl mx-auto px-6 py-8 pb-16">
        <h2 className="text-xl font-bold mb-6">Quick Links</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/explorer/blocks"
            className="p-5 rounded-xl border border-black/10 hover:border-black/20 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-black/5 flex items-center justify-center group-hover:bg-[#0055ff]/10 transition-colors">
                <svg className="w-5 h-5 text-black/40 group-hover:text-[#0055ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <span className="font-semibold">Blocks</span>
            </div>
            <p className="text-sm text-black/60">Browse all blocks with pagination</p>
          </Link>

          <a
            href="https://stellar.expert/explorer/testnet"
            target="_blank"
            rel="noopener noreferrer"
            className="p-5 rounded-xl border border-black/10 hover:border-black/20 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-black/5 flex items-center justify-center group-hover:bg-[#0055ff]/10 transition-colors">
                <svg className="w-5 h-5 text-black/40 group-hover:text-[#0055ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
              <span className="font-semibold">Stellar.expert</span>
            </div>
            <p className="text-sm text-black/60">View raw Stellar network data</p>
          </a>

          <Link
            href="/"
            className="p-5 rounded-xl border border-black/10 hover:border-black/20 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-black/5 flex items-center justify-center group-hover:bg-[#0055ff]/10 transition-colors">
                <svg className="w-5 h-5 text-black/40 group-hover:text-[#0055ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <span className="font-semibold">TVA Home</span>
            </div>
            <p className="text-sm text-black/60">Back to TVA Protocol homepage</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

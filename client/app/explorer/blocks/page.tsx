"use client";

import { useState } from "react";
import { ExplorerHeader } from "../components/ExplorerHeader";
import { BlockCard } from "../components/BlockCard";
import { SimplePagination } from "../components/Pagination";
import { useLatestBlock } from "../hooks/useLatestBlock";
import { useBlocksPage } from "../hooks/useBlocks";
import { BLOCKS_PER_PAGE } from "../lib/constants";

export default function BlocksPage() {
  const { data: latestBlockNumber } = useLatestBlock();
  const [page, setPage] = useState(0);

  const startBlock = latestBlockNumber ? latestBlockNumber - page * BLOCKS_PER_PAGE : 0;
  const { blocks, isLoading } = useBlocksPage(startBlock, BLOCKS_PER_PAGE);

  const hasNext = startBlock - BLOCKS_PER_PAGE >= 0;
  const hasPrev = page > 0;

  return (
    <div className="min-h-screen bg-white">
      <ExplorerHeader />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Blocks</h1>
          <p className="text-black/60">
            {latestBlockNumber
              ? `Showing blocks ${Math.max(0, startBlock - BLOCKS_PER_PAGE + 1).toLocaleString()} - ${startBlock.toLocaleString()} of ${latestBlockNumber.toLocaleString()}`
              : "Loading..."}
          </p>
        </div>

        {/* Block List */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: BLOCKS_PER_PAGE }).map((_, i) => (
              <div key={i} className="h-32 rounded-xl bg-black/5 animate-pulse" />
            ))}
          </div>
        ) : blocks.length === 0 ? (
          <div className="text-center py-16 text-black/40">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-lg">No blocks found</p>
            <p className="text-sm mt-1">Make sure the TVA RPC server is running</p>
          </div>
        ) : (
          <div className="space-y-4">
            {blocks.map((block) => (
              <BlockCard key={block.number} block={block} />
            ))}
          </div>
        )}

        {/* Pagination */}
        <div className="mt-8 flex justify-center">
          <SimplePagination
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrev={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      </div>
    </div>
  );
}

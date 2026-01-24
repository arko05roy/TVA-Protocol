"use client";

import { use } from "react";
import Link from "next/link";
import { ExplorerHeader } from "../../components/ExplorerHeader";
import { DualView } from "../../components/DualView";
import { useBlock } from "../../hooks/useBlocks";
import {
  formatBlockNumberHex,
  formatTimestamp,
  formatRelativeTime,
  formatGas,
  truncateHash,
  getStellarExpertLedgerUrl,
} from "../../lib/formatter";

interface BlockDetailPageProps {
  params: Promise<{ blockNumber: string }>;
}

export default function BlockDetailPage({ params }: BlockDetailPageProps) {
  const { blockNumber } = use(params);
  const blockNum = parseInt(blockNumber, 10);
  const { data: block, isLoading, isError } = useBlock(blockNum, true);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <ExplorerHeader />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-10 w-64 bg-black/10 rounded" />
            <div className="h-64 bg-black/5 rounded-xl" />
            <div className="h-48 bg-black/5 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !block) {
    return (
      <div className="min-h-screen bg-white">
        <ExplorerHeader />
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-black/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 2a10 10 0 110 20 10 10 0 010-20z" />
          </svg>
          <h1 className="text-2xl font-bold mb-2">Block Not Found</h1>
          <p className="text-black/60 mb-6">Block #{blockNumber} could not be found</p>
          <Link href="/explorer/blocks" className="text-[#0055ff] hover:underline">
            Back to blocks
          </Link>
        </div>
      </div>
    );
  }

  const stellarContent = (
    <div className="space-y-4">
      <div className="flex justify-between py-2 border-b border-black/5">
        <span className="text-black/50">Ledger Sequence</span>
        <span className="font-mono font-medium">{block.number.toLocaleString()}</span>
      </div>
      <div className="flex justify-between py-2 border-b border-black/5">
        <span className="text-black/50">Hash</span>
        <span className="font-mono text-sm">{truncateHash(block.hash, 12)}</span>
      </div>
      <div className="flex justify-between py-2 border-b border-black/5">
        <span className="text-black/50">Parent Hash</span>
        <span className="font-mono text-sm">{truncateHash(block.parentHash, 12)}</span>
      </div>
      <div className="flex justify-between py-2 border-b border-black/5">
        <span className="text-black/50">Close Time</span>
        <span>{formatRelativeTime(block.timestamp)}</span>
      </div>
      <div className="flex justify-between py-2 border-b border-black/5">
        <span className="text-black/50">Transaction Count</span>
        <span className="font-medium">{block.transactions.length}</span>
      </div>
      <div className="pt-2">
        <a
          href={getStellarExpertLedgerUrl(block.number)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-[#0055ff] hover:underline"
        >
          View on Stellar.expert
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  );

  const evmContent = (
    <div className="space-y-4">
      <div className="flex justify-between py-2 border-b border-[#0055ff]/10">
        <span className="text-[#0055ff]/50">Block Number</span>
        <span className="font-mono font-medium">{formatBlockNumberHex(block.number)}</span>
      </div>
      <div className="flex justify-between py-2 border-b border-[#0055ff]/10">
        <span className="text-[#0055ff]/50">Hash</span>
        <span className="font-mono text-sm">{truncateHash(block.hash, 12)}</span>
      </div>
      <div className="flex justify-between py-2 border-b border-[#0055ff]/10">
        <span className="text-[#0055ff]/50">Gas Used</span>
        <span className="font-mono">{formatGas(block.gasUsed)}</span>
      </div>
      <div className="flex justify-between py-2 border-b border-[#0055ff]/10">
        <span className="text-[#0055ff]/50">Gas Limit</span>
        <span className="font-mono">{formatGas(block.gasLimit)}</span>
      </div>
      <div className="flex justify-between py-2 border-b border-[#0055ff]/10">
        <span className="text-[#0055ff]/50">Timestamp</span>
        <span className="text-sm">{formatTimestamp(block.timestamp)}</span>
      </div>
      <div className="flex justify-between py-2 border-b border-[#0055ff]/10">
        <span className="text-[#0055ff]/50">Miner</span>
        <Link href={`/explorer/address/${block.miner}`} className="font-mono text-sm text-[#0055ff] hover:underline">
          {truncateHash(block.miner, 8)}
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <ExplorerHeader />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-black/40 mb-6">
          <Link href="/explorer" className="hover:text-black">Explorer</Link>
          <span>/</span>
          <Link href="/explorer/blocks" className="hover:text-black">Blocks</Link>
          <span>/</span>
          <span className="text-black font-mono">{block.number.toLocaleString()}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              Block #{block.number.toLocaleString()}
            </h1>
            <p className="text-black/60 font-mono text-sm">{block.hash}</p>
          </div>
          <div className="flex items-center gap-3">
            {block.number > 0 && (
              <Link
                href={`/explorer/blocks/${block.number - 1}`}
                className="p-2 rounded-lg border border-black/10 hover:border-black/20 transition-colors"
                title="Previous block"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            )}
            <Link
              href={`/explorer/blocks/${block.number + 1}`}
              className="p-2 rounded-lg border border-black/10 hover:border-black/20 transition-colors"
              title="Next block"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Dual View */}
        <div className="mb-8">
          <DualView
            stellarContent={stellarContent}
            evmContent={evmContent}
            stellarTitle="Stellar / Ledger"
            evmTitle="EVM / Block"
          />
        </div>

        {/* Transactions */}
        <div className="mt-12">
          <h2 className="text-xl font-bold mb-4">
            Transactions ({block.transactions.length})
          </h2>

          {block.transactions.length === 0 ? (
            <div className="text-center py-12 bg-black/5 rounded-xl text-black/40">
              No transactions in this block
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-black/10 divide-y divide-black/5">
              {(block.transactions as string[]).map((txHash, i) => (
                <Link
                  key={txHash}
                  href={`/explorer/tx/${txHash}`}
                  className="flex items-center justify-between p-4 hover:bg-black/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-black/40 w-8">#{i}</span>
                    <span className="font-mono text-sm text-[#0055ff]">
                      {truncateHash(txHash, 16)}
                    </span>
                  </div>
                  <svg className="w-5 h-5 text-black/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

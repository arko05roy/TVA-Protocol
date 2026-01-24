"use client";

import Link from "next/link";
import type { EvmBlock } from "@tva-protocol/sdk/types";
import { formatRelativeTime, formatBlockNumberHex, truncateHash, formatGas } from "../lib/formatter";

interface BlockCardProps {
  block: EvmBlock;
  compact?: boolean;
}

export function BlockCard({ block, compact = false }: BlockCardProps) {
  if (compact) {
    return (
      <Link
        href={`/explorer/blocks/${block.number}`}
        className="flex items-center justify-between p-4 hover:bg-black/5 rounded-lg transition-colors group"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-black/5 flex items-center justify-center group-hover:bg-[#0055ff]/10 transition-colors">
            <svg className="w-5 h-5 text-black/40 group-hover:text-[#0055ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div>
            <div className="font-mono font-medium">
              {block.number.toLocaleString()}
            </div>
            <div className="text-xs text-black/40">
              {formatRelativeTime(block.timestamp)}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-black/60">
            {block.transactions.length} txn{block.transactions.length !== 1 ? "s" : ""}
          </div>
          <div className="text-xs text-black/40 font-mono">
            {formatBlockNumberHex(block.number)}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/explorer/blocks/${block.number}`}
      className="block p-5 border border-black/10 rounded-xl hover:border-black/20 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-black/5 flex items-center justify-center group-hover:bg-[#0055ff]/10 transition-colors">
            <svg className="w-6 h-6 text-black/40 group-hover:text-[#0055ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div>
            <div className="font-mono font-semibold text-lg">
              Block {block.number.toLocaleString()}
            </div>
            <div className="text-sm text-black/40">
              {formatRelativeTime(block.timestamp)}
            </div>
          </div>
        </div>
        <div className="px-2 py-1 rounded bg-black/5 text-xs font-mono text-black/60">
          {formatBlockNumberHex(block.number)}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-black/5">
        <div>
          <div className="text-xs text-black/40 uppercase tracking-wider mb-1">Hash</div>
          <div className="font-mono text-sm">{truncateHash(block.hash)}</div>
        </div>
        <div>
          <div className="text-xs text-black/40 uppercase tracking-wider mb-1">Transactions</div>
          <div className="font-medium">{block.transactions.length}</div>
        </div>
        <div>
          <div className="text-xs text-black/40 uppercase tracking-wider mb-1">Gas Used</div>
          <div className="font-mono text-sm">{formatGas(block.gasUsed)}</div>
        </div>
        <div>
          <div className="text-xs text-black/40 uppercase tracking-wider mb-1">Gas Limit</div>
          <div className="font-mono text-sm">{formatGas(block.gasLimit)}</div>
        </div>
      </div>
    </Link>
  );
}

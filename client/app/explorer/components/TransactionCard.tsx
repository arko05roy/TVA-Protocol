"use client";

import Link from "next/link";
import { truncateAddress, truncateHash, formatWei, formatRelativeTime } from "../lib/formatter";

interface TransactionCardProps {
  tx: {
    hash: string;
    from: string;
    to: string | null;
    value: string;
    blockNumber: number;
    timestamp?: number;
  };
  compact?: boolean;
}

export function TransactionCard({ tx, compact = false }: TransactionCardProps) {
  const isContractCreation = !tx.to;

  if (compact) {
    return (
      <Link
        href={`/explorer/tx/${tx.hash}`}
        className="flex items-center justify-between p-4 hover:bg-black/5 rounded-lg transition-colors group"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-black/5 flex items-center justify-center group-hover:bg-[#0055ff]/10 transition-colors">
            {isContractCreation ? (
              <svg className="w-5 h-5 text-black/40 group-hover:text-[#0055ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-black/40 group-hover:text-[#0055ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            )}
          </div>
          <div>
            <div className="font-mono text-sm">
              {truncateHash(tx.hash)}
            </div>
            <div className="text-xs text-black/40">
              {tx.timestamp ? formatRelativeTime(tx.timestamp) : `Block ${tx.blockNumber}`}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm">
            <span className="text-black/40">From </span>
            <span className="font-mono">{truncateAddress(tx.from)}</span>
          </div>
          <div className="text-sm">
            {isContractCreation ? (
              <span className="text-[#0055ff]">Contract Creation</span>
            ) : (
              <>
                <span className="text-black/40">To </span>
                <span className="font-mono">{truncateAddress(tx.to!)}</span>
              </>
            )}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/explorer/tx/${tx.hash}`}
      className="block p-5 border border-black/10 rounded-xl hover:border-black/20 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-black/5 flex items-center justify-center group-hover:bg-[#0055ff]/10 transition-colors">
            {isContractCreation ? (
              <svg className="w-6 h-6 text-black/40 group-hover:text-[#0055ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-black/40 group-hover:text-[#0055ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            )}
          </div>
          <div>
            <div className="font-mono text-sm mb-1">{truncateHash(tx.hash, 12)}</div>
            <div className="text-xs text-black/40">
              Block {tx.blockNumber.toLocaleString()}
            </div>
          </div>
        </div>
        {isContractCreation && (
          <div className="px-2 py-1 rounded bg-[#0055ff]/10 text-xs font-medium text-[#0055ff]">
            Contract Creation
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-black/5">
        <div>
          <div className="text-xs text-black/40 uppercase tracking-wider mb-1">From</div>
          <div className="font-mono text-sm">{truncateAddress(tx.from, 8)}</div>
        </div>
        <div>
          <div className="text-xs text-black/40 uppercase tracking-wider mb-1">To</div>
          <div className="font-mono text-sm">
            {isContractCreation ? (
              <span className="text-[#0055ff]">New Contract</span>
            ) : (
              truncateAddress(tx.to!, 8)
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-black/40 uppercase tracking-wider mb-1">Value</div>
          <div className="font-mono text-sm">
            {formatWei(BigInt(tx.value))} ETH
          </div>
        </div>
      </div>
    </Link>
  );
}

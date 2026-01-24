"use client";

import { use } from "react";
import Link from "next/link";
import { ExplorerHeader } from "../../components/ExplorerHeader";
import { DualView } from "../../components/DualView";
import { AddressDisplay } from "../../components/AddressDisplay";
import { BalanceDisplay } from "../../components/BalanceDisplay";
import { EventLogList } from "../../components/EventLog";
import { useTransactionWithReceipt } from "../../hooks/useTransaction";
import {
  formatTimestamp,
  formatGas,
  truncateHash,
  formatWei,
  getStellarExpertTxUrl,
} from "../../lib/formatter";

interface TransactionDetailPageProps {
  params: Promise<{ hash: string }>;
}

export default function TransactionDetailPage({ params }: TransactionDetailPageProps) {
  const { hash } = use(params);
  const { transaction: tx, receipt, isLoading, isError } = useTransactionWithReceipt(hash);

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

  if (isError || !tx) {
    return (
      <div className="min-h-screen bg-white">
        <ExplorerHeader />
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-black/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 2a10 10 0 110 20 10 10 0 010-20z" />
          </svg>
          <h1 className="text-2xl font-bold mb-2">Transaction Not Found</h1>
          <p className="text-black/60 mb-6">Transaction {truncateHash(hash)} could not be found</p>
          <Link href="/explorer" className="text-[#0055ff] hover:underline">
            Back to explorer
          </Link>
        </div>
      </div>
    );
  }

  const isContractCreation = !tx.to;
  const status = receipt?.status === 1 ? "Success" : receipt?.status === 0 ? "Failed" : "Pending";

  const stellarContent = (
    <div className="space-y-4">
      <div className="flex justify-between py-2 border-b border-black/5">
        <span className="text-black/50">Transaction ID</span>
        <span className="font-mono text-sm">{truncateHash(tx.hash, 12)}</span>
      </div>
      <div className="flex justify-between py-2 border-b border-black/5">
        <span className="text-black/50">Source Account</span>
        <AddressDisplay evmAddress={tx.from} truncate showLink />
      </div>
      {!isContractCreation && (
        <div className="flex justify-between py-2 border-b border-black/5">
          <span className="text-black/50">Destination</span>
          <AddressDisplay evmAddress={tx.to} truncate showLink />
        </div>
      )}
      {receipt && (
        <div className="flex justify-between py-2 border-b border-black/5">
          <span className="text-black/50">Ledger</span>
          <Link href={`/explorer/blocks/${receipt.blockNumber}`} className="text-[#0055ff] hover:underline font-mono">
            {receipt.blockNumber.toLocaleString()}
          </Link>
        </div>
      )}
      <div className="flex justify-between py-2 border-b border-black/5">
        <span className="text-black/50">Fee</span>
        <span className="font-mono">{tx.gasPrice ? formatWei(BigInt(tx.gasPrice)) : "—"} stroops</span>
      </div>
      {isContractCreation && receipt?.contractAddress && (
        <div className="flex justify-between py-2 border-b border-black/5">
          <span className="text-black/50">Created Contract</span>
          <AddressDisplay evmAddress={receipt.contractAddress} truncate showLink />
        </div>
      )}
      <div className="pt-2">
        <a
          href={getStellarExpertTxUrl(tx.hash)}
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
        <span className="text-[#0055ff]/50">Transaction Hash</span>
        <span className="font-mono text-sm">{truncateHash(tx.hash, 12)}</span>
      </div>
      <div className="flex justify-between py-2 border-b border-[#0055ff]/10">
        <span className="text-[#0055ff]/50">From</span>
        <AddressDisplay evmAddress={tx.from} truncate showLink />
      </div>
      <div className="flex justify-between py-2 border-b border-[#0055ff]/10">
        <span className="text-[#0055ff]/50">To</span>
        {isContractCreation ? (
          <span className="text-[#0055ff] font-medium">Contract Creation</span>
        ) : (
          <AddressDisplay evmAddress={tx.to} truncate showLink />
        )}
      </div>
      <div className="flex justify-between py-2 border-b border-[#0055ff]/10">
        <span className="text-[#0055ff]/50">Value</span>
        <BalanceDisplay balance={BigInt(tx.value || "0")} />
      </div>
      <div className="flex justify-between py-2 border-b border-[#0055ff]/10">
        <span className="text-[#0055ff]/50">Gas Price</span>
        <span className="font-mono">{tx.gasPrice ? formatWei(BigInt(tx.gasPrice), 9) : "—"} Gwei</span>
      </div>
      {receipt && (
        <>
          <div className="flex justify-between py-2 border-b border-[#0055ff]/10">
            <span className="text-[#0055ff]/50">Gas Used</span>
            <span className="font-mono">{formatGas(receipt.gasUsed)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-[#0055ff]/10">
            <span className="text-[#0055ff]/50">Block</span>
            <Link href={`/explorer/blocks/${receipt.blockNumber}`} className="text-[#0055ff] hover:underline font-mono">
              {receipt.blockNumber.toLocaleString()}
            </Link>
          </div>
        </>
      )}
      <div className="flex justify-between py-2 border-b border-[#0055ff]/10">
        <span className="text-[#0055ff]/50">Nonce</span>
        <span className="font-mono">{tx.nonce}</span>
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
          <span className="text-black">Transaction</span>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold">Transaction Details</h1>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                status === "Success"
                  ? "bg-green-100 text-green-700"
                  : status === "Failed"
                  ? "bg-red-100 text-red-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {status}
            </span>
            {isContractCreation && (
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-[#0055ff]/10 text-[#0055ff]">
                Contract Creation
              </span>
            )}
          </div>
          <p className="text-black/60 font-mono text-sm break-all">{tx.hash}</p>
        </div>

        {/* Dual View */}
        <div className="mb-8">
          <DualView
            stellarContent={stellarContent}
            evmContent={evmContent}
            stellarTitle="Stellar / Transaction"
            evmTitle="EVM / Transaction"
          />
        </div>

        {/* Input Data */}
        {tx.input && tx.input !== "0x" && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">Input Data</h2>
            <div className="p-4 bg-black/5 rounded-xl font-mono text-sm break-all max-h-48 overflow-y-auto">
              {tx.input}
            </div>
          </div>
        )}

        {/* Event Logs */}
        {receipt && receipt.logs && receipt.logs.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-bold mb-4">
              Event Logs ({receipt.logs.length})
            </h2>
            <EventLogList logs={receipt.logs} />
          </div>
        )}
      </div>
    </div>
  );
}

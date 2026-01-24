"use client";

import { use } from "react";
import Link from "next/link";
import { ExplorerHeader } from "../../components/ExplorerHeader";
import { DualView } from "../../components/DualView";
import { BalanceDisplay } from "../../components/BalanceDisplay";
import { EventLogList } from "../../components/EventLog";
import { useAddress } from "../../hooks/useAddress";
import { useLogs } from "../../hooks/useTransaction";
import {
  truncateHash,
  truncateAddress,
  formatWei,
  weiToXlm,
  getStellarExpertAccountUrl,
  isEvmAddress,
} from "../../lib/formatter";

interface AddressDetailPageProps {
  params: Promise<{ address: string }>;
}

export default function AddressDetailPage({ params }: AddressDetailPageProps) {
  const { address } = use(params);
  const { data: addressData, isLoading, isError } = useAddress(address);
  const { data: logs, isLoading: logsLoading } = useLogs(
    isEvmAddress(address) ? address : null,
    0,
    "latest"
  );

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

  if (isError || !addressData) {
    return (
      <div className="min-h-screen bg-white">
        <ExplorerHeader />
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-black/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 2a10 10 0 110 20 10 10 0 010-20z" />
          </svg>
          <h1 className="text-2xl font-bold mb-2">Address Not Found</h1>
          <p className="text-black/60 mb-6">Address {truncateAddress(address)} could not be found</p>
          <Link href="/explorer" className="text-[#0055ff] hover:underline">
            Back to explorer
          </Link>
        </div>
      </div>
    );
  }

  const isContract = addressData.accountType === "Contract";

  const stellarContent = (
    <div className="space-y-4">
      <div className="flex justify-between py-2 border-b border-black/5">
        <span className="text-black/50">Account Type</span>
        <span className={`px-2 py-1 rounded text-sm font-medium ${
          isContract ? "bg-[#0055ff]/10 text-[#0055ff]" : "bg-black/5"
        }`}>
          {isContract ? "Contract" : "Account (EOA)"}
        </span>
      </div>
      <div className="py-2 border-b border-black/5">
        <span className="text-black/50 block mb-2">Address</span>
        <span className="font-mono text-sm break-all">{address}</span>
      </div>
      <div className="flex justify-between py-2 border-b border-black/5">
        <span className="text-black/50">Balance (XLM)</span>
        <span className="font-mono">{weiToXlm(addressData.balance)} XLM</span>
      </div>
      <div className="flex justify-between py-2 border-b border-black/5">
        <span className="text-black/50">Sequence Number</span>
        <span className="font-mono">{addressData.nonce}</span>
      </div>
      <div className="pt-2">
        <a
          href={getStellarExpertAccountUrl(address)}
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
        <span className="text-[#0055ff]/50">Account Type</span>
        <span className={`px-2 py-1 rounded text-sm font-medium ${
          isContract ? "bg-[#0055ff]/10 text-[#0055ff]" : "bg-[#0055ff]/5"
        }`}>
          {isContract ? "Contract" : "EOA"}
        </span>
      </div>
      <div className="py-2 border-b border-[#0055ff]/10">
        <span className="text-[#0055ff]/50 block mb-2">Address</span>
        <span className="font-mono text-sm break-all">{address}</span>
      </div>
      <div className="flex justify-between py-2 border-b border-[#0055ff]/10">
        <span className="text-[#0055ff]/50">Balance</span>
        <BalanceDisplay balance={addressData.balance} />
      </div>
      <div className="flex justify-between py-2 border-b border-[#0055ff]/10">
        <span className="text-[#0055ff]/50">Nonce</span>
        <span className="font-mono">{addressData.nonce}</span>
      </div>
      {isContract && addressData.code && (
        <div className="py-2 border-b border-[#0055ff]/10">
          <span className="text-[#0055ff]/50 block mb-2">Code Hash</span>
          <span className="font-mono text-sm">{truncateHash(addressData.code, 16)}</span>
        </div>
      )}
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
          <span className="text-black">Address</span>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold">
              {isContract ? "Contract" : "Address"}
            </h1>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              isContract ? "bg-[#0055ff]/10 text-[#0055ff]" : "bg-black/5"
            }`}>
              {isContract ? "Contract" : "EOA"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-black/60 font-mono text-sm break-all">{address}</p>
            <button
              onClick={() => navigator.clipboard.writeText(address)}
              className="p-1.5 rounded hover:bg-black/5 transition-colors"
              title="Copy address"
            >
              <svg className="w-4 h-4 text-black/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Balance Card */}
        <div className="mb-8 p-6 rounded-xl border border-black/10 bg-gradient-to-r from-[#0055ff]/5 to-transparent">
          <div className="text-sm text-black/50 uppercase tracking-wider mb-2">Balance</div>
          <div className="flex items-baseline gap-4">
            <span className="text-3xl font-bold font-mono">
              {formatWei(addressData.balance)}
            </span>
            <span className="text-black/40">ETH</span>
            <span className="text-black/30">|</span>
            <span className="text-xl font-mono text-black/60">
              {weiToXlm(addressData.balance)}
            </span>
            <span className="text-black/40">XLM</span>
          </div>
        </div>

        {/* Dual View */}
        <div className="mb-8">
          <DualView
            stellarContent={stellarContent}
            evmContent={evmContent}
            stellarTitle="Stellar / Account"
            evmTitle="EVM / Address"
          />
        </div>

        {/* Contract Code */}
        {isContract && addressData.code && addressData.code !== "0x" && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">Contract Code</h2>
            <div className="p-4 bg-black/5 rounded-xl font-mono text-xs break-all max-h-48 overflow-y-auto">
              {addressData.code}
            </div>
          </div>
        )}

        {/* Events/Logs */}
        {isContract && (
          <div className="mt-12">
            <h2 className="text-xl font-bold mb-4">
              Recent Events {logs && `(${logs.length})`}
            </h2>
            {logsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-24 rounded-lg bg-black/5 animate-pulse" />
                ))}
              </div>
            ) : logs && logs.length > 0 ? (
              <EventLogList logs={logs.slice(0, 10)} />
            ) : (
              <div className="text-center py-12 bg-black/5 rounded-xl text-black/40">
                No events found for this address
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

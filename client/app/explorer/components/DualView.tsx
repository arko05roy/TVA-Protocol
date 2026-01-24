"use client";

import { useState, ReactNode } from "react";

interface DualViewProps {
  stellarContent: ReactNode;
  evmContent: ReactNode;
  stellarTitle?: string;
  evmTitle?: string;
}

export function DualView({
  stellarContent,
  evmContent,
  stellarTitle = "Stellar View",
  evmTitle = "EVM View",
}: DualViewProps) {
  const [activeTab, setActiveTab] = useState<"stellar" | "evm">("evm");

  return (
    <div className="w-full">
      {/* Mobile Tabs */}
      <div className="flex md:hidden border-b border-black/10 mb-4">
        <button
          onClick={() => setActiveTab("stellar")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "stellar"
              ? "text-[#0055ff] border-b-2 border-[#0055ff]"
              : "text-black/50 hover:text-black/70"
          }`}
        >
          {stellarTitle}
        </button>
        <button
          onClick={() => setActiveTab("evm")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "evm"
              ? "text-[#0055ff] border-b-2 border-[#0055ff]"
              : "text-black/50 hover:text-black/70"
          }`}
        >
          {evmTitle}
        </button>
      </div>

      {/* Mobile Content */}
      <div className="md:hidden">
        {activeTab === "stellar" ? stellarContent : evmContent}
      </div>

      {/* Desktop Side-by-Side */}
      <div className="hidden md:grid md:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl border border-black/10 bg-white">
          <h3 className="text-sm font-semibold text-black/50 uppercase tracking-wider mb-4">
            {stellarTitle}
          </h3>
          {stellarContent}
        </div>
        <div className="p-5 rounded-xl border border-[#0055ff]/20 bg-[#0055ff]/5">
          <h3 className="text-sm font-semibold text-[#0055ff]/70 uppercase tracking-wider mb-4">
            {evmTitle}
          </h3>
          {evmContent}
        </div>
      </div>
    </div>
  );
}

/**
 * Single row item for dual view
 */
export function DualViewRow({
  label,
  stellarValue,
  evmValue,
}: {
  label: string;
  stellarValue: ReactNode;
  evmValue: ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-4 py-3 border-b border-black/5 last:border-0">
      <div className="text-sm text-black/50">{label}</div>
      <div className="font-mono text-sm">{stellarValue}</div>
      <div className="font-mono text-sm text-[#0055ff]">{evmValue}</div>
    </div>
  );
}

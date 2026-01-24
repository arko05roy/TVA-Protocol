"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { parseSearchInput } from "../lib/formatter";

interface SearchBarProps {
  className?: string;
  placeholder?: string;
}

export function SearchBar({ className = "", placeholder = "Search by Block / Tx Hash / Address" }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;

    setError(null);
    const { type, value } = parseSearchInput(query);

    switch (type) {
      case "block":
        router.push(`/explorer/blocks/${value}`);
        break;
      case "transaction":
        router.push(`/explorer/tx/${value}`);
        break;
      case "address":
        router.push(`/explorer/address/${value}`);
        break;
      default:
        setError("Invalid search query. Enter a block number, transaction hash, or address.");
    }
  }, [query, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSearch();
      }
    },
    [handleSearch]
  );

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full px-4 py-3 pr-12 border border-black/10 rounded-xl font-mono text-sm bg-white focus:outline-none focus:border-[#0055ff] focus:ring-2 focus:ring-[#0055ff]/10 transition-all"
          />
          <button
            onClick={handleSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-black/5 transition-colors"
            aria-label="Search"
          >
            <svg
              className="w-5 h-5 text-black/40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>
        </div>
      </div>
      {error && (
        <p className="absolute top-full left-0 mt-2 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}

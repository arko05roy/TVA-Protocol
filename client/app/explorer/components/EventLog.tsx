"use client";

import Link from "next/link";
import type { EvmLog } from "@tva-protocol/sdk/types";
import { truncateHash, truncateAddress } from "../lib/formatter";

interface EventLogProps {
  log: EvmLog;
  expanded?: boolean;
}

export function EventLog({ log, expanded = false }: EventLogProps) {
  return (
    <div className="p-4 border border-black/10 rounded-lg">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded bg-[#0055ff]/10 text-xs font-mono text-[#0055ff]">
            Log #{log.logIndex}
          </span>
          {log.removed && (
            <span className="px-2 py-1 rounded bg-red-100 text-xs font-medium text-red-600">
              Removed
            </span>
          )}
        </div>
        <span className="text-xs text-black/40">Tx Index: {log.transactionIndex}</span>
      </div>

      <div className="space-y-3">
        {/* Address */}
        <div>
          <div className="text-xs text-black/40 uppercase tracking-wider mb-1">Address</div>
          <Link
            href={`/explorer/address/${log.address}`}
            className="font-mono text-sm text-[#0055ff] hover:underline"
          >
            {expanded ? log.address : truncateAddress(log.address, 10)}
          </Link>
        </div>

        {/* Topics */}
        {log.topics.length > 0 && (
          <div>
            <div className="text-xs text-black/40 uppercase tracking-wider mb-1">
              Topics ({log.topics.length})
            </div>
            <div className="space-y-1">
              {log.topics.map((topic, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-black/40 w-4">[{i}]</span>
                  <span className="font-mono text-xs bg-black/5 px-2 py-1 rounded break-all">
                    {expanded ? topic : truncateHash(topic, 12)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Data */}
        {log.data && log.data !== "0x" && (
          <div>
            <div className="text-xs text-black/40 uppercase tracking-wider mb-1">Data</div>
            <div className="font-mono text-xs bg-black/5 px-3 py-2 rounded break-all max-h-32 overflow-y-auto">
              {expanded ? log.data : truncateHash(log.data, 20)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface EventLogListProps {
  logs: EvmLog[];
  expanded?: boolean;
}

export function EventLogList({ logs, expanded = false }: EventLogListProps) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-black/40">
        No events emitted in this transaction
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log, i) => (
        <EventLog key={`${log.transactionHash}-${log.logIndex}`} log={log} expanded={expanded} />
      ))}
    </div>
  );
}

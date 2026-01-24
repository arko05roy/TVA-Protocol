"use client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className = "",
}: PaginationProps) {
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    pages.push(1);

    if (currentPage > 3) {
      pages.push("...");
    }

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push("...");
    }

    pages.push(totalPages);

    return pages;
  };

  if (totalPages <= 1) return null;

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      {/* Previous */}
      <button
        onClick={() => canGoPrev && onPageChange(currentPage - 1)}
        disabled={!canGoPrev}
        className={`px-3 py-2 rounded-lg border transition-colors ${
          canGoPrev
            ? "border-black/10 hover:border-black/20 hover:bg-black/5"
            : "border-black/5 text-black/30 cursor-not-allowed"
        }`}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Page Numbers */}
      <div className="flex items-center gap-1">
        {getPageNumbers().map((page, i) =>
          page === "..." ? (
            <span key={`ellipsis-${i}`} className="px-3 py-2 text-black/40">
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page as number)}
              className={`px-3 py-2 rounded-lg transition-colors min-w-[40px] ${
                currentPage === page
                  ? "bg-[#0055ff] text-white font-medium"
                  : "hover:bg-black/5"
              }`}
            >
              {page}
            </button>
          )
        )}
      </div>

      {/* Next */}
      <button
        onClick={() => canGoNext && onPageChange(currentPage + 1)}
        disabled={!canGoNext}
        className={`px-3 py-2 rounded-lg border transition-colors ${
          canGoNext
            ? "border-black/10 hover:border-black/20 hover:bg-black/5"
            : "border-black/5 text-black/30 cursor-not-allowed"
        }`}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Simple prev/next pagination
 */
export function SimplePagination({
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  className = "",
}: {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <button
        onClick={onPrev}
        disabled={!hasPrev}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
          hasPrev
            ? "border-black/10 hover:border-black/20 hover:bg-black/5"
            : "border-black/5 text-black/30 cursor-not-allowed"
        }`}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Previous
      </button>
      <button
        onClick={onNext}
        disabled={!hasNext}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
          hasNext
            ? "border-black/10 hover:border-black/20 hover:bg-black/5"
            : "border-black/5 text-black/30 cursor-not-allowed"
        }`}
      >
        Next
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

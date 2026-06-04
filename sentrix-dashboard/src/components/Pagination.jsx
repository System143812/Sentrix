import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";

/**
 * Sentrix Modern Pagination v2
 * Features dynamic page size selection and robust 'First/Last' navigation logic.
 */
export function Pagination({
  currentPage = 1,
  totalItems = 0,
  pageSize = 15,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 15, 25, 50],
}) {
  const safeTotalItems = Number(totalItems) || 0;
  const safePageSize = Number(pageSize) || 15;
  const safeCurrentPage = Number(currentPage) || 1;

  const totalPages = Math.ceil(safeTotalItems / safePageSize);

  // Show pagination if there's more than one page OR if total items exceed the base threshold (5)
  // This ensures the user can still change page size even if the current view fits on one page.
  const shouldShow = totalPages > 1 || safeTotalItems > 5;
  if (!shouldShow) return null;

  const startItem = (safeCurrentPage - 1) * safePageSize + 1;
  const endItem = Math.min(safeCurrentPage * safePageSize, safeTotalItems);

  const getPageNumbers = () => {
    const pages = [];

    // Configuration variables for easy adjustment
    const MAX_PAGES_BEFORE_ELLIPSIS = 7; // Total pages before we start hiding with ...
    const MIDDLE_RANGE = 2; // How many numbers to show on each side of current (2+1+2 = 5 total)

    // If we have few pages, just show them all
    if (totalPages <= MAX_PAGES_BEFORE_ELLIPSIS) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    // Logic for larger datasets: 1 ... [Middle Block] ... Last

    // Case 1: Near the beginning
    // e.g., [1, 2, 3, 4, 5, 6, ..., 120]
    const isNearStart = safeCurrentPage <= MIDDLE_RANGE + 2;
    if (isNearStart) {
      const showUntil = MAX_PAGES_BEFORE_ELLIPSIS - 1;
      for (let i = 1; i <= showUntil; i++) pages.push(i);
      pages.push("...");
      pages.push(totalPages);
    }
    // Case 2: Near the end
    // e.g., [1, ..., 115, 116, 117, 118, 119, 120]
    else if (safeCurrentPage >= totalPages - (MIDDLE_RANGE + 1)) {
      pages.push(1);
      pages.push("...");
      const startFrom = totalPages - (MAX_PAGES_BEFORE_ELLIPSIS - 2);
      for (let i = startFrom; i <= totalPages; i++) pages.push(i);
    }
    // Case 3: In the middle
    // e.g., [1, ..., 7, 8, 9, 10, 11, ..., 120]
    else {
      pages.push(1);
      pages.push("...");

      const start = safeCurrentPage - MIDDLE_RANGE;
      const end = safeCurrentPage + MIDDLE_RANGE;

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      pages.push("...");
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex flex-col items-center justify-between gap-6 border-t border-slate-100 bg-white px-6 py-4 lg:flex-row">
      {/* Left Section: Page Size & Info */}
      <div className="flex flex-wrap items-center justify-center gap-6 lg:justify-start">
        {onPageSizeChange && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold tracking-tight text-slate-400">
              Show
            </span>
            <div className="relative group">
              <select
                value={safePageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-xs font-bold text-slate-700 transition-all hover:border-slate-300 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer"
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>
          </div>
        )}

        <p className="text-[10px] font-bold tracking-tight text-slate-400">
          <span className="hidden sm:inline">Showing </span>
          <span className="text-slate-900 tabular-nums">{startItem}</span>
          <span className="mx-1 opacity-30">—</span>
          <span className="text-slate-900 tabular-nums">{endItem}</span>
          <span className="mx-2 text-slate-200">/</span>
          <span className="text-slate-900 tabular-nums">
            {safeTotalItems}
          </span>
        </p>
      </div>

      {/* Right Section: Navigation Controls */}
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button
          onClick={() => onPageChange(safeCurrentPage - 1)}
          disabled={safeCurrentPage === 1}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 disabled:opacity-30 disabled:hover:border-slate-200"
          title="Previous"
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, index) => {
            const isEllipsis = page === '...';
            const isMobileHidden = !isEllipsis && 
                                   page !== 1 && 
                                   page !== totalPages && 
                                   Math.abs(page - safeCurrentPage) > 1;

            return (
              <React.Fragment key={index}>
                {isEllipsis ? (
                  <div className="flex h-9 w-6 items-center justify-center text-slate-300">
                    <MoreHorizontal size={14} />
                  </div>
                ) : (
                  <button
                    onClick={() => onPageChange(page)}
                    aria-current={safeCurrentPage === page ? 'page' : undefined}
                    className={`flex h-9 min-w-[36px] items-center justify-center rounded-lg px-2 text-xs font-bold transition-all ${
                      isMobileHidden ? 'hidden md:flex' : 'flex'
                    } ${
                      safeCurrentPage === page
                        ? 'bg-slate-900 text-white'
                        : 'border border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {page}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </div>

        <button
          onClick={() => onPageChange(safeCurrentPage + 1)}
          disabled={safeCurrentPage === totalPages}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 disabled:opacity-30 disabled:hover:border-slate-200"
          title="Next"
        >
          <ChevronRight size={16} strokeWidth={1.5} />
        </button>
      </nav>
    </div>
  );
}

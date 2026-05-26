import { useState, useEffect } from 'react';

/**
 * A custom hook to persist pagination state (page and size) in localStorage.
 * 
 * @param {string} key - A unique key for the page (e.g., 'devices', 'audit').
 * @param {number} defaultSize - The initial page size if none is saved.
 */
export function usePaginationState(key, defaultSize = 5) {
  const storageKey = `sentrix_pagination_${key}`;

  // Initialize state from localStorage or defaults
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          currentPage: Number(parsed.currentPage) || 1,
          pageSize: Number(parsed.pageSize) || defaultSize
        };
      }
    } catch (e) {
      console.error(`Failed to load pagination state for ${key}`, e);
    }
    return { currentPage: 1, pageSize: defaultSize };
  });

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state, storageKey]);

  const setCurrentPage = (page) => {
    setState(prev => ({ ...prev, currentPage: page }));
  };

  const setPageSize = (size) => {
    setState({ currentPage: 1, pageSize: size }); // Reset to page 1 when size changes
  };

  return {
    currentPage: state.currentPage,
    pageSize: state.pageSize,
    setCurrentPage,
    setPageSize
  };
}

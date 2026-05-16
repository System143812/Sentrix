import { useState, useCallback } from "react";

// Custom hook for managing pending/loading states for async actions
// Simplifies tracking which action is in progress and disabling UI accordingly
export function usePendingAction() {
  const [pending, setPendingState] = useState(null);

  const isLoading = useCallback((actionName) => pending === actionName, [pending]);

  const setPending = useCallback(async (actionName, asyncFn) => {
    setPendingState(actionName);
    try {
      return await asyncFn();
    } finally {
      setPendingState(null);
    }
  }, []);

  const clear = useCallback(() => setPendingState(null), []);

  return {
    pending,
    isLoading,
    setPending,
    clear,
  };
}

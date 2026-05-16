import { useState, useCallback } from "react";

// Custom hook for managing message/error/loading states for async operations
// Provides consistent pattern for displaying feedback to users
export function useAsyncMessage(initialState = { message: "", error: "", loading: false }) {
  const [state, setState] = useState(initialState);

  const setMessage = useCallback((message) => {
    setState((prev) => ({ ...prev, message, error: "" }));
  }, []);

  const setError = useCallback((error) => {
    setState((prev) => ({ ...prev, error, message: "" }));
  }, []);

  const setLoading = useCallback((loading) => {
    setState((prev) => ({ ...prev, loading }));
  }, []);

  const clearMessage = useCallback(() => {
    setState((prev) => ({ ...prev, message: "", error: "" }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, [initialState]);

  return {
    ...state,
    setMessage,
    setError,
    setLoading,
    clearMessage,
    reset,
  };
}

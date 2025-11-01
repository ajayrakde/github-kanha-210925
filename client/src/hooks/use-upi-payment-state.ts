import { useCallback, useEffect, useRef, useState } from "react";

export type UpiPaymentWidgetStatus = "idle" | "awaiting" | "processing" | "success" | "failed";

export interface UseUpiPaymentStateOptions {
  onStatusChange?: (status: UpiPaymentWidgetStatus) => void;
}

export interface UseUpiPaymentStateReturn {
  status: UpiPaymentWidgetStatus;
  setAwaiting: () => void;
  setProcessing: () => void;
  setSuccess: () => void;
  setFailed: () => void;
  reset: () => void;
  schedulePoll: (handler: () => void, delayMs: number) => void;
  clearPoll: () => void;
  onCollectTriggered: () => void;
}

export function useUpiPaymentState(
  options: UseUpiPaymentStateOptions = {}
): UseUpiPaymentStateReturn {
  const { onStatusChange } = options;
  const [status, setStatus] = useState<UpiPaymentWidgetStatus>("idle");
  const pollTimeoutRef = useRef<number | null>(null);

  const updateStatus = useCallback(
    (next: UpiPaymentWidgetStatus) => {
      setStatus((previous) => {
        if (previous === next) {
          return previous;
        }
        onStatusChange?.(next);
        return next;
      });
    },
    [onStatusChange]
  );

  const clearPoll = useCallback(() => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const schedulePoll = useCallback<UseUpiPaymentStateReturn["schedulePoll"]>((handler, delayMs) => {
    clearPoll();
    pollTimeoutRef.current = window.setTimeout(() => {
      pollTimeoutRef.current = null;
      handler();
    }, delayMs);
  }, [clearPoll]);

  const reset = useCallback(() => {
    clearPoll();
    updateStatus("idle");
  }, [clearPoll, updateStatus]);

  const setAwaiting = useCallback(() => {
    updateStatus("awaiting");
  }, [updateStatus]);

  const setProcessing = useCallback(() => {
    updateStatus("processing");
  }, [updateStatus]);

  const setSuccess = useCallback(() => {
    clearPoll();
    updateStatus("success");
  }, [clearPoll, updateStatus]);

  const setFailed = useCallback(() => {
    clearPoll();
    updateStatus("failed");
  }, [clearPoll, updateStatus]);

  const onCollectTriggered = useCallback(() => {
    updateStatus("awaiting");
  }, [updateStatus]);

  useEffect(() => () => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
    }
  }, []);

  return {
    status,
    setAwaiting,
    setProcessing,
    setSuccess,
    setFailed,
    reset,
    schedulePoll,
    clearPoll,
    onCollectTriggered,
  };
}

export default useUpiPaymentState;

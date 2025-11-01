import { useCallback, useEffect, useRef, useState } from "react";
import type { PhonePeInstrumentPreference } from "@/lib/upi-payment";

export type UpiWidgetStatus = "awaiting" | "processing" | "completed" | "failed";

interface UseUpiPaymentStateOptions {
  initialInstrument?: PhonePeInstrumentPreference;
}

export const useUpiPaymentState = (
  options: UseUpiPaymentStateOptions = {}
) => {
  const [status, setStatus] = useState<UpiWidgetStatus>("awaiting");
  const [instrumentPreference, setInstrumentPreference] = useState<PhonePeInstrumentPreference>(
    options.initialInstrument ?? "UPI_INTENT"
  );
  const pollTimeoutRef = useRef<number | null>(null);

  const clearPollTimeout = useCallback(() => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const setAwaiting = useCallback(() => {
    clearPollTimeout();
    setStatus("awaiting");
  }, [clearPollTimeout]);

  const setProcessing = useCallback(() => {
    setStatus("processing");
  }, []);

  const setCompleted = useCallback(() => {
    clearPollTimeout();
    setStatus("completed");
  }, [clearPollTimeout]);

  const setFailed = useCallback(() => {
    clearPollTimeout();
    setStatus("failed");
  }, [clearPollTimeout]);

  const schedulePoll = useCallback(
    (callback: () => void, delay = 3000) => {
      clearPollTimeout();
      pollTimeoutRef.current = window.setTimeout(() => {
        pollTimeoutRef.current = null;
        callback();
      }, delay);
    },
    [clearPollTimeout]
  );

  const handleCollectTriggered = useCallback(() => {
    setStatus("processing");
  }, []);

  useEffect(() => () => clearPollTimeout(), [clearPollTimeout]);

  return {
    status,
    instrumentPreference,
    setInstrumentPreference,
    setAwaiting,
    setProcessing,
    setCompleted,
    setFailed,
    schedulePoll,
    clearPollTimeout,
    pollTimeoutRef,
    handleCollectTriggered,
  } as const;
};

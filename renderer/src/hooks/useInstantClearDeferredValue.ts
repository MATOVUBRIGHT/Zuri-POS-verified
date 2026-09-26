import { useDeferredValue, useMemo } from "react";

/**
 * Like React's useDeferredValue, but clears immediately when the user deletes text.
 * This avoids the "laggy backspace" feeling in search boxes while still deferring
 * expensive filtering work during typing.
 */
export function useInstantClearDeferredValue(value: string): string {
  const deferred = useDeferredValue(value);

  return useMemo(() => {
    // Empty should always reflect immediately (show all / no results right away).
    if (!value || value.trim() === "") return value;

    // When deleting, prefer the current value to avoid laggy clears.
    if (value.length < deferred.length) return value;

    return deferred;
  }, [value, deferred]);
}


import { useCallback, useEffect, useRef, useState } from "react";
import { firebaseEnabled, watchWorkspace } from "./firebase";

export interface Loaded<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
}

/** Loads data and keeps it fresh: Firestore pushes a change signal when available, otherwise it polls. */
export function useLive<T>(fetcher: () => Promise<T>, deps: unknown[] = [], pollMs = 6000): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const reload = useCallback(async () => {
    try {
      const result = await fetchRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload();
    const unwatch = watchWorkspace(() => { reload(); });
    const timer = firebaseEnabled ? null : window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, pollMs);
    const onRefresh = () => { reload(); };
    window.addEventListener("kaigo:refresh", onRefresh);
    return () => {
      unwatch();
      if (timer) window.clearInterval(timer);
      window.removeEventListener("kaigo:refresh", onRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload };
}

/** Tell every live view on the page to refetch (after this tab changed something). */
export const broadcastRefresh = () => window.dispatchEvent(new Event("kaigo:refresh"));

/** Wraps an async action with busy and error state. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    setBusy(true);
    setError(null);
    try {
      const result = await fn(...args);
      broadcastRefresh();
      return result;
    } catch (err) {
      setError(err);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [fn]);
  return { run, busy, error, setError };
}

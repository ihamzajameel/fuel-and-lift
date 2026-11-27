import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { STORAGE_KEY, loadState, migrate, saveState } from './storage';
import { dayKey } from './time';

const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const [state, setState] = useState(loadState);
  const latest = useRef(state);
  latest.current = state;

  // Debounced save + flush when the app is backgrounded/closed.
  useEffect(() => {
    const t = setTimeout(() => saveState(state), 200);
    return () => clearTimeout(t);
  }, [state]);
  useEffect(() => {
    const flush = () => saveState(latest.current);
    // Another tab/window of the app saved: adopt its data instead of overwriting it later.
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const next = migrate(JSON.parse(e.newValue));
        latest.current = next;
        setState(next);
      } catch {
        /* ignore malformed writes */
      }
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  /** Mutate a deep copy of state. `fn` must be pure (it may run twice in dev). */
  const mutate = useCallback((fn) => {
    setState((s) => {
      const d = structuredClone(s);
      fn(d);
      return d;
    });
  }, []);

  const replace = useCallback((next) => setState(next), []);
  /** Functional update for whole-state changes (used by cross-device sync). */
  const apply = useCallback((fn) => setState((s) => fn(s)), []);

  // A clock that ticks every 30 s so "today", pacing and timelines stay fresh.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const today = dayKey(new Date(now), state.settings.dayStartHour);

  const value = useMemo(
    () => ({ state, mutate, replace, apply, now, today, latest }),
    [state, mutate, replace, apply, now, today]
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);

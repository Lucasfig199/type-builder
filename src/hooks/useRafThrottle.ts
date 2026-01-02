import { useCallback, useEffect, useRef } from "react";

export function useRafThrottle<T extends (...args: any[]) => void>(fn: T) {
  const fnRef = useRef(fn);
  const rafRef = useRef<number | null>(null);
  const lastArgsRef = useRef<Parameters<T> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return useCallback((...args: Parameters<T>) => {
    lastArgsRef.current = args;

    if (rafRef.current !== null) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (lastArgsRef.current) {
        fnRef.current(...lastArgsRef.current);
        lastArgsRef.current = null;
      }
    });
  }, []);
}
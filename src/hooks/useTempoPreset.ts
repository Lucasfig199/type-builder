import { useState, useEffect, useCallback } from 'react';

export interface TempoPreset {
  minSeconds: number;
  maxSeconds: number;
}

const DEFAULT_PRESET: TempoPreset = {
  minSeconds: 5,
  maxSeconds: 10,
};

/**
 * Hook to manage the default tempo preset for new Time cards.
 * Persists to localStorage per operation ID.
 */
export function useTempoPreset(operationId?: string) {
  const storageKey = operationId 
    ? `tempoPreset:${operationId}` 
    : 'tempoPreset:global';

  const [preset, setPreset] = useState<TempoPreset>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as TempoPreset;
        if (
          typeof parsed.minSeconds === 'number' &&
          typeof parsed.maxSeconds === 'number' &&
          parsed.minSeconds >= 0 &&
          parsed.maxSeconds > parsed.minSeconds
        ) {
          return parsed;
        }
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_PRESET;
  });

  // Sync with localStorage when operationId changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as TempoPreset;
        if (
          typeof parsed.minSeconds === 'number' &&
          typeof parsed.maxSeconds === 'number' &&
          parsed.minSeconds >= 0 &&
          parsed.maxSeconds > parsed.minSeconds
        ) {
          setPreset(parsed);
          return;
        }
      }
    } catch {
      // Ignore parse errors
    }
    setPreset(DEFAULT_PRESET);
  }, [storageKey]);

  const savePreset = useCallback((newPreset: TempoPreset) => {
    if (
      newPreset.minSeconds >= 0 &&
      newPreset.maxSeconds > newPreset.minSeconds &&
      newPreset.minSeconds <= 999 &&
      newPreset.maxSeconds <= 999
    ) {
      setPreset(newPreset);
      localStorage.setItem(storageKey, JSON.stringify(newPreset));
      return true;
    }
    return false;
  }, [storageKey]);

  const resetToDefault = useCallback(() => {
    setPreset(DEFAULT_PRESET);
    localStorage.setItem(storageKey, JSON.stringify(DEFAULT_PRESET));
  }, [storageKey]);

  return {
    preset,
    savePreset,
    resetToDefault,
    defaultPreset: DEFAULT_PRESET,
  };
}

/**
 * Get tempo preset from localStorage (for use outside of React components)
 */
export function getTempoPreset(operationId?: string): TempoPreset {
  const storageKey = operationId 
    ? `tempoPreset:${operationId}` 
    : 'tempoPreset:global';

  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as TempoPreset;
      if (
        typeof parsed.minSeconds === 'number' &&
        typeof parsed.maxSeconds === 'number' &&
        parsed.minSeconds >= 0 &&
        parsed.maxSeconds > parsed.minSeconds
      ) {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_PRESET;
}

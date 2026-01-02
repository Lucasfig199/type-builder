import { useCallback } from 'react';

/**
 * Hook para persistir e recuperar a ordem dos fluxos em localStorage.
 * Chave: flowOrder:<operationId>:<groupId>
 */
export function useLocalFlowOrder(operationId: string | undefined, groupId: string) {
  const storageKey = `flowOrder:${operationId ?? 'default'}:${groupId}`;

  /**
   * Retorna a ordem salva dos fluxos (array de IDs) ou null se não existir.
   */
  const getLocalOrder = useCallback((): string[] | null => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
      return null;
    } catch {
      return null;
    }
  }, [storageKey]);

  /**
   * Salva a ordem dos fluxos no localStorage.
   * Silencioso em caso de sucesso; só mostra erro em falhas reais.
   */
  const setLocalOrder = useCallback((orderedIds: string[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(orderedIds));
      // Sucesso: não mostrar nada
    } catch {
      // Silencioso: erros de localStorage são não-críticos para a UX
      // A ordem simplesmente não será persistida após F5
    }
  }, [storageKey]);

  /**
   * Remove a ordem salva do localStorage.
   */
  const clearLocalOrder = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  /**
   * Aplica a ordem salva a um array de fluxos.
   * - IDs que existem na ordem salva ficam na posição correta.
   * - IDs novos (não na ordem salva) vão para o final.
   * - IDs que não existem mais são ignorados.
   */
  const applyLocalOrder = useCallback((flowIds: string[]): string[] => {
    const savedOrder = getLocalOrder();
    if (!savedOrder || savedOrder.length === 0) {
      return flowIds;
    }

    const existingSet = new Set(flowIds);
    const orderedResult: string[] = [];

    // Primeiro: adiciona IDs que existem na ordem salva (na ordem correta)
    for (const id of savedOrder) {
      if (existingSet.has(id)) {
        orderedResult.push(id);
        existingSet.delete(id);
      }
    }

    // Depois: adiciona IDs novos que não estavam na ordem salva
    for (const id of flowIds) {
      if (existingSet.has(id)) {
        orderedResult.push(id);
      }
    }

    return orderedResult;
  }, [getLocalOrder]);

  return {
    getLocalOrder,
    setLocalOrder,
    clearLocalOrder,
    applyLocalOrder,
  };
}

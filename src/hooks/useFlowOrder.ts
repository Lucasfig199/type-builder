import { useState, useCallback } from 'react';
import { Flow, SupabaseConfig } from '@/types/workflow';
import { toast } from 'sonner';

const TABLE_NAME = 'TYPE_BUILDER';

interface UseFlowOrderProps {
  supabaseConfig: SupabaseConfig;
  groupName: string;
}

export function useFlowOrder({ supabaseConfig, groupName }: UseFlowOrderProps) {
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Persiste a ordem dos fluxos no Supabase.
   * Atualiza todas as linhas de cada fluxo com o FLOW_ORDER correspondente.
   */
  const saveFlowOrder = useCallback(async (flows: Flow[]): Promise<boolean> => {
    if (!supabaseConfig.isConnected) {
      // Se não está conectado, apenas retorna sucesso (ordem fica só local)
      return true;
    }

    setIsSaving(true);

    try {
      // Atualiza cada fluxo com seu novo FLOW_ORDER
      const updates = flows.map((flow, index) => {
        const order = index + 1;
        const url =
          `${supabaseConfig.url}/rest/v1/${encodeURIComponent(TABLE_NAME)}` +
          `?GRUPO=eq.${encodeURIComponent(groupName)}&FLUXO=eq.${encodeURIComponent(flow.name)}`;

        return fetch(url, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseConfig.anonKey,
            Authorization: `Bearer ${supabaseConfig.anonKey}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ FLOW_ORDER: order }),
        });
      });

      const results = await Promise.all(updates);
      const failed = results.filter((r) => !r.ok);

      if (failed.length > 0) {
        console.error('Some flow order updates failed:', failed);
        toast.error('Erro ao salvar ordem de alguns fluxos');
        return false;
      }

      toast.success('Ordem salva ✅');
      return true;
    } catch (err) {
      console.error('Error saving flow order:', err);
      toast.error('Erro ao salvar ordem');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [supabaseConfig, groupName]);

  /**
   * Busca os fluxos do grupo ordenados por FLOW_ORDER.
   * Retorna um mapa de flowName -> order para aplicar localmente.
   */
  const fetchFlowOrder = useCallback(async (): Promise<Map<string, number> | null> => {
    if (!supabaseConfig.isConnected) {
      return null;
    }

    try {
      const url =
        `${supabaseConfig.url}/rest/v1/${encodeURIComponent(TABLE_NAME)}` +
        `?GRUPO=eq.${encodeURIComponent(groupName)}&select=FLUXO,FLOW_ORDER`;

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          apikey: supabaseConfig.anonKey,
          Authorization: `Bearer ${supabaseConfig.anonKey}`,
        },
      });

      if (!res.ok) {
        console.error('Failed to fetch flow order:', res.status);
        return null;
      }

      const data: Array<{ FLUXO: string; FLOW_ORDER: number | null }> = await res.json();
      
      // Agrupa por FLUXO e pega o menor FLOW_ORDER de cada
      const orderMap = new Map<string, number>();
      const flowOrders = new Map<string, number[]>();

      for (const row of data) {
        if (row.FLOW_ORDER != null) {
          const existing = flowOrders.get(row.FLUXO) || [];
          existing.push(row.FLOW_ORDER);
          flowOrders.set(row.FLUXO, existing);
        }
      }

      for (const [flowName, orders] of flowOrders) {
        orderMap.set(flowName, Math.min(...orders));
      }

      return orderMap;
    } catch (err) {
      console.error('Error fetching flow order:', err);
      return null;
    }
  }, [supabaseConfig, groupName]);

  return {
    saveFlowOrder,
    fetchFlowOrder,
    isSaving,
  };
}

import type { Group, SupabaseConfig } from "@/types/workflow";

export interface Operation {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  supabaseConfig: SupabaseConfig;
  groups: Group[];
}
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from './supabase';

export type SystemLabel = {
  id: string;
  key: string;
  label: string;
  category: string;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
};

type LabelsState = {
  labels: Record<string, string>;
  raw: SystemLabel[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateLabel: (id: string, label: string) => Promise<void>;
};

const LabelsContext = createContext<LabelsState | undefined>(undefined);

export function LabelsProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<SystemLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('system_labels').select('*').order('category, key');
    if (error) { setError(error.message); return; }
    setRaw((data ?? []) as SystemLabel[]);
    setError(null);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await refresh();
      if (active) setLoading(false);
    })();
    const channel = supabase
      .channel('system-labels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_labels' }, () => { void refresh(); })
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [refresh]);

  const labels: Record<string, string> = {};
  for (const r of raw) labels[r.key] = r.label;

  const updateLabel = useCallback(async (id: string, label: string) => {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('system_labels').update({ label, updated_at: new Date().toISOString(), updated_by: userData.user?.id ?? null }).eq('id', id);
    if (error) throw new Error(error.message);
    await refresh();
  }, [refresh]);

  return (
    <LabelsContext.Provider value={{ labels, raw, loading, error, refresh, updateLabel }}>
      {children}
    </LabelsContext.Provider>
  );
}

export function useLabels() {
  const ctx = useContext(LabelsContext);
  if (!ctx) throw new Error('useLabels must be used within LabelsProvider');
  return ctx;
}

export function useL() {
  const { labels } = useLabels();
  return useCallback((key: string, fallback?: string) => labels[key] ?? fallback ?? key, [labels]);
}

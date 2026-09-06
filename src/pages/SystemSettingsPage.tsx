import { useEffect, useState, useCallback } from 'react';
import { Save, Settings as SettingsIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fmtDate } from '../lib/utils';
import { PageHeader, EmptyState, LoadingState, Toast } from '../components/ui';
import type { SystemSetting } from '../types';

export function SystemSettingsPage() {
  const { hasPermission } = useAuth();
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [edited, setEdited] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from('system_settings').select('*').order('category').order('key');
    setSettings((data ?? []) as SystemSetting[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingState />;
  if (!hasPermission('manage_system_settings')) return <EmptyState title="Access denied" subtitle="You do not have permission to manage system settings." />;

  const categories = [...new Set(settings.map((s) => s.category))];

  const save = async () => {
    setSaving(true);
    const entries = Object.entries(edited);
    for (const [key, value] of entries) {
      await supabase.from('system_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
    }
    setSaving(false);
    setEdited({});
    setToast('Settings saved successfully');
    void load();
  };

  const getValue = (s: SystemSetting) => edited[s.key] ?? s.value;

  return (
    <div>
      <PageHeader
        title="System Settings"
        subtitle="Configure evaluation windows, SLA thresholds, RF parameters, and exam defaults"
        actions={<button onClick={save} disabled={saving || Object.keys(edited).length === 0} className="btn-primary"><Save className="h-4 w-4" /> Save Changes</button>}
      />

      <div className="space-y-6">
        {categories.map((cat) => (
          <div key={cat} className="card p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><SettingsIcon className="h-4 w-4 text-brand-600" /> {cat}</h3>
            <div className="space-y-3">
              {settings.filter((s) => s.category === cat).map((s) => (
                <div key={s.id} className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-center">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{s.key.replace(/_/g, ' ')}</div>
                    {s.description && <div className="text-xs text-slate-400">{s.description}</div>}
                  </div>
                  <input
                    value={getValue(s)}
                    onChange={(e) => setEdited({ ...edited, [s.key]: e.target.value })}
                    className={`input sm:col-span-1 ${edited[s.key] ? 'border-brand-400' : ''}`}
                  />
                  <div className="text-xs text-slate-400">Updated {fmtDate(s.updated_at)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

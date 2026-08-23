import { useEffect, useState, useCallback } from 'react';
import {
  Trash2, AlertTriangle, ShieldCheck, CheckCircle2, Clock, FileText,
  X, Search, History, Lock, BarChart3, LayoutDashboard, Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { cls, fmtDate, fmtDateTime, todayISO } from '../lib/utils';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui';
import type { DataClearanceLog } from '../types';

const ICON_MAP: Record<string, typeof FileText> = {
  FileText, CheckCircle2, ShieldCheck, Search, AlertTriangle, Clock, History, BarChart3, LayoutDashboard, Users,
};

type ClearTable = { table: string; dateColumn: string };

type DynamicModule = {
  key: string;
  label: string;
  description: string;
  tables: ClearTable[];
  icon: typeof FileText;
  active: boolean;
  recordCount?: number;
};

function parseTables(value: unknown): ClearTable[] {
  const v = value as { table?: string; dateColumn?: string; tables?: ClearTable[] };
  if (Array.isArray(v.tables) && v.tables.length > 0) return v.tables;
  if (v.table) return [{ table: v.table, dateColumn: v.dateColumn ?? 'created_at' }];
  return [];
}

export function DataClearancePage() {
  const { profile, hasPermission } = useAuth();
  const [modules, setModules] = useState<DynamicModule[]>([]);
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [clearDate, setClearDate] = useState('');
  const [reason, setReason] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});
  const [counting, setCounting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<DataClearanceLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [loadingTypes, setLoadingTypes] = useState(true);

  const loadTypes = useCallback(async () => {
    setLoadingTypes(true);
    const { data, error } = await supabase.from('system_config').select('*').eq('category', 'clearance_types').order('sort_order');
    if (error || !data) { setModules([]); setLoadingTypes(false); return; }
    const parsed: DynamicModule[] = (data as Array<{ key: string; label: string | null; description: string | null; value: Record<string, unknown>; active: boolean }>)
      .filter((e) => e.active)
      .map((e) => ({
        key: e.key,
        label: e.label ?? e.key,
        description: e.description ?? '',
        tables: parseTables(e.value),
        icon: ICON_MAP[(e.value as { icon?: string }).icon ?? 'FileText'] ?? FileText,
        active: e.active,
        recordCount: undefined,
      }));
    setModules(parsed);
    setLoadingTypes(false);
    // Fetch live total record counts (sum across all tables for each module)
    for (const m of parsed) {
      let total = 0;
      for (const t of m.tables) {
        const { count } = await supabase.from(t.table).select('*', { count: 'exact', head: true });
        total += count ?? 0;
      }
      setModules((prev) => prev.map((p) => (p.key === m.key ? { ...p, recordCount: total } : p)));
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    const { data, error } = await supabase.from('data_clearance_log').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) { setLogs([]); }
    else setLogs((data ?? []) as DataClearanceLog[]);
    setLogsLoading(false);
  }, []);

  useEffect(() => { loadTypes(); loadLogs(); }, [loadTypes, loadLogs]);

  if (!hasPermission('data_clearance')) {
    return <ErrorState message="You do not have permission to access this page." />;
  }

  const toggleModule = (key: string) => {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSuccess(null);
    setError(null);
  };

  const countRecords = async (): Promise<Record<string, number>> => {
    const counts: Record<string, number> = {};
    for (const mod of modules) {
      if (!selectedModules.has(mod.key)) continue;
      let total = 0;
      for (const t of mod.tables) {
        const { count, error } = await supabase.from(t.table).select('*', { count: 'exact', head: true }).lte(t.dateColumn, clearDate);
        if (!error) total += count ?? 0;
      }
      counts[mod.key] = total;
    }
    return counts;
  };

  const handleShowConfirm = async () => {
    if (selectedModules.size === 0) { setError('Please select at least one module.'); return; }
    if (!clearDate) { setError('Please select a date.'); return; }
    if (!reason.trim()) { setError('Please provide a reason for data clearance.'); return; }
    setError(null);
    setCounting(true);
    try {
      const counts = await countRecords();
      setRecordCounts(counts);
      setShowConfirm(true);
    } catch {
      setError('Failed to count records. Please try again.');
    } finally {
      setCounting(false);
    }
  };

  const totalRecords = Object.values(recordCounts).reduce((s, n) => s + n, 0);

  const handleConfirmClear = async () => {
    setClearing(true);
    setError(null);
    try {
      let totalDeleted = 0;
      for (const mod of modules) {
        if (!selectedModules.has(mod.key)) continue;
        for (const t of mod.tables) {
          const { error: delErr } = await supabase.from(t.table).delete().lte(t.dateColumn, clearDate);
          if (delErr) {
            setError(`Failed to clear ${mod.label} (${t.table}): ${delErr.message}`);
            setClearing(false);
            return;
          }
        }
        totalDeleted += recordCounts[mod.key] ?? 0;
      }

      await supabase.from('data_clearance_log').insert({
        admin_user_id: profile?.id ?? null,
        admin_name: profile?.full_name ?? profile?.email ?? 'Unknown',
        modules: Array.from(selectedModules),
        date_filter: clearDate,
        record_count: totalDeleted,
        reason: reason.trim(),
      });

      await logAudit({
        action: 'data_clearance',
        entity_type: 'data_clearance',
        entity_id: null,
        page_module: 'data_clearance',
        new_value: {
          modules: Array.from(selectedModules),
          date_filter: clearDate,
          record_count: totalDeleted,
          reason: reason.trim(),
        },
      });

      setSuccess(`Successfully cleared ${totalDeleted} record(s) on or before ${clearDate}.`);
      setSelectedModules(new Set());
      setClearDate('');
      setReason('');
      setShowConfirm(false);
      setRecordCounts({});
      await loadLogs();
      await loadTypes();
    } catch {
      setError('An unexpected error occurred during data clearance.');
    } finally {
      setClearing(false);
    }
  };

  if (loadingTypes) return <LoadingState label="Loading clearance types…" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Clearance"
        subtitle="Permanently remove historical operational data — configuration, users, and settings are preserved"
      />

      {/* Warning banner */}
      <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4">
        <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
        <div>
          <p className="text-sm font-semibold text-rose-800">This action is irreversible</p>
          <p className="mt-1 text-sm text-rose-600">
            Data clearance permanently deletes operational records. System configuration, user accounts, projects, and settings will not be affected.
            Every clearance operation is recorded in the Audit History.
          </p>
        </div>
      </div>

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> {success}
          <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-600"><X className="h-4 w-4" /></button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-600"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Module selection */}
      <div className="card p-5">
        <div className="mb-1 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Select Modules to Clear</h3>
            <p className="mt-0.5 text-xs text-slate-500">Choose one or more modules. Records on or before the selected date will be permanently deleted.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">{modules.length} types available</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((mod) => {
            const selected = selectedModules.has(mod.key);
            const Icon = mod.icon;
            return (
              <button
                key={mod.key}
                onClick={() => toggleModule(mod.key)}
                className={cls(
                  'flex items-center gap-3 rounded-lg border-2 p-4 text-left transition',
                  selected ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'
                )}
              >
                <div className={cls('flex h-10 w-10 items-center justify-center rounded-lg', selected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400')}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700">{mod.label}</p>
                  <p className="text-xs text-slate-400">
                    {mod.recordCount != null ? `${mod.recordCount.toLocaleString()} total records` : 'Loading…'}
                  </p>
                </div>
                {selected && <CheckCircle2 className="h-5 w-5 text-brand-600" />}
              </button>
            );
          })}
        </div>
        {modules.length === 0 && (
          <div className="mt-4">
            <EmptyState icon={<AlertTriangle className="h-8 w-8" />} title="No clearance types configured" subtitle="Go to System Administration to add clearance types" />
          </div>
        )}
      </div>

      {/* Date filter and reason */}
      <div className="card space-y-4 p-5">
        <div>
          <label className="label">Clear Data On or Before Date *</label>
          <input
            type="date"
            value={clearDate}
            onChange={(e) => setClearDate(e.target.value)}
            max={todayISO()}
            className="input"
          />
          <p className="mt-1 text-xs text-slate-400">
            All records in the selected module(s) with a date on or before this will be permanently deleted.
          </p>
        </div>
        <div>
          <label className="label">Reason for Data Clearance *</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="input"
            placeholder="Explain why this data is being cleared (required for audit history)…"
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleShowConfirm}
            disabled={selectedModules.size === 0 || !clearDate || !reason.trim() || counting}
            className="btn-primary"
          >
            {counting ? <><Clock className="h-4 w-4 animate-spin" /> Counting records…</> : <><Trash2 className="h-4 w-4" /> Review & Confirm</>}
          </button>
        </div>
      </div>

      {/* Audit history */}
      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <History className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-slate-700">Clearance History</h3>
        </div>
        {logsLoading ? (
          <p className="text-sm text-slate-400">Loading history…</p>
        ) : logs.length === 0 ? (
          <EmptyState icon={<History className="h-8 w-8" />} title="No clearance operations yet" subtitle="All data clearance operations will be recorded here" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="px-3 py-2 text-left">Administrator</th>
                  <th className="px-3 py-2 text-left">Modules</th>
                  <th className="px-3 py-2 text-left">Date Filter</th>
                  <th className="px-3 py-2 text-left">Records</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Date & Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="table-row">
                    <td className="px-3 py-2 font-medium text-slate-700">{log.admin_name}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {log.modules.map((m) => (
                          <span key={m} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{m}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{fmtDate(log.date_filter)}</td>
                    <td className="px-3 py-2 font-bold text-rose-600">{log.record_count}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{log.reason}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{fmtDateTime(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !clearing && setShowConfirm(false)}>
          <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <Lock className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Confirm Data Clearance</h2>
                <p className="text-sm text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <div className="space-y-3 rounded-lg bg-rose-50 p-4">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Selected Modules</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {modules.filter((m) => selectedModules.has(m.key)).map((m) => (
                    <span key={m.key} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">{m.label}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Clear Data On or Before</p>
                <p className="mt-0.5 text-sm font-bold text-slate-800">{fmtDate(clearDate)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Records to Delete</p>
                <p className="mt-0.5 text-2xl font-bold text-rose-600">{totalRecords}</p>
                {totalRecords === 0 && <p className="text-xs text-slate-500">No records found on or before this date in the selected modules.</p>}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Reason</p>
                <p className="mt-0.5 text-sm text-slate-700">{reason}</p>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span><strong>Warning:</strong> {totalRecords} record(s) will be permanently deleted. This action cannot be undone.</span>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} disabled={clearing} className="btn-secondary">Cancel</button>
              <button
                onClick={handleConfirmClear}
                disabled={clearing || totalRecords === 0}
                className="btn-primary bg-rose-600 hover:bg-rose-700"
              >
                {clearing ? <><Clock className="h-4 w-4 animate-spin" /> Clearing…</> : <><Trash2 className="h-4 w-4" /> Delete {totalRecords} Record(s)</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

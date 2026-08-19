import { useEffect, useState } from 'react';
import { ScrollText, Download, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fmtDateTime, downloadCSV } from '../lib/utils';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui';
import { useL } from '../lib/labels';
import type { AuditEntry } from '../types';

export function AuditHistoryPage() {
  const L = useL();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('audit_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) setError(error.message);
      else setEntries((data ?? []) as AuditEntry[]);
      setLoading(false);
    })();
  }, []);

  const filtered = entries.filter((e) => {
    if (filterAction && !e.action.toLowerCase().includes(filterAction.toLowerCase())) return false;
    if (filterEntity && e.entity_type !== filterEntity) return false;
    if (filterUser && !(e.user_email ?? '').toLowerCase().includes(filterUser.toLowerCase())) return false;
    if (filterModule && !(e.page_module ?? '').toLowerCase().includes(filterModule.toLowerCase())) return false;
    return true;
  });

  const entityTypes = Array.from(new Set(entries.map((e) => e.entity_type)));
  const moduleTypes = Array.from(new Set(entries.map((e) => e.page_module).filter(Boolean) as string[]));

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    downloadCSV('audit_history.csv', filtered.map((e) => ({
      timestamp: fmtDateTime(e.created_at),
      user: e.user_email ?? '',
      role: e.user_role ?? '',
      action: e.action,
      page_module: e.page_module ?? '',
      entity_type: e.entity_type,
      entity_id: e.entity_id ?? '',
      old_value: e.old_value ? JSON.stringify(e.old_value) : '',
      new_value: e.new_value ? JSON.stringify(e.new_value) : '',
      ip_address: e.ip_address ?? '',
      details: JSON.stringify(e.details),
    })));
  };

  if (loading) return <LoadingState label="Loading audit history…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={L('page.audit', 'Audit History')}
        subtitle={`${filtered.length} entries`}
        actions={
          <button onClick={handleExport} disabled={filtered.length === 0} className="btn-secondary">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        }
      />

      {/* Filters */}
      <div className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <div>
          <label className="label">User</label>
          <input value={filterUser} onChange={(e) => setFilterUser(e.target.value)} placeholder="Search user…" className="input" />
        </div>
        <div>
          <label className="label">Action</label>
          <input value={filterAction} onChange={(e) => setFilterAction(e.target.value)} placeholder="Search action…" className="input" />
        </div>
        <div>
          <label className="label">Entity Type</label>
          <select value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)} className="input">
            <option value="">All</option>
            {entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Module</label>
          <select value={filterModule} onChange={(e) => setFilterModule(e.target.value)} className="input">
            <option value="">All</option>
            {moduleTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<ScrollText className="h-10 w-10" />} title="No audit entries" />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="px-4 py-3 font-semibold">Date & Time</th>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Module</th>
                  <th className="px-4 py-3 font-semibold">Entity</th>
                  <th className="px-4 py-3 font-semibold">Changes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const expanded = expandedRows.has(e.id);
                  const hasChanges = e.old_value || e.new_value;
                  return (
                    <>
                      <tr key={e.id} className="table-row cursor-pointer hover:bg-slate-50" onClick={() => hasChanges && toggleRow(e.id)}>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDateTime(e.created_at)}</td>
                        <td className="px-4 py-3 font-medium text-slate-700">{e.user_email ?? '—'}</td>
                        <td className="px-4 py-3">
                          {e.user_role && <span className="badge-neutral">{e.user_role}</span>}
                        </td>
                        <td className="px-4 py-3"><span className="badge-neutral">{e.action}</span></td>
                        <td className="px-4 py-3 text-slate-600">{e.page_module ?? e.entity_type}</td>
                        <td className="px-4 py-3 text-slate-500">{e.entity_type}</td>
                        <td className="px-4 py-3">
                          {hasChanges ? (
                            <button onClick={(ev) => { ev.stopPropagation(); toggleRow(e.id); }} className="text-xs text-brand-600 hover:text-brand-700">
                              {expanded ? 'Hide' : 'View'}
                            </button>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                      {expanded && hasChanges && (
                        <tr key={`${e.id}-detail`} className="bg-slate-50">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              {e.old_value && (
                                <div>
                                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-500">Old Value</div>
                                  <pre className="rounded-lg bg-rose-50 p-3 text-xs text-slate-700 overflow-x-auto">{JSON.stringify(e.old_value, null, 2)}</pre>
                                </div>
                              )}
                              {e.new_value && (
                                <div>
                                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-500">New Value</div>
                                  <pre className="rounded-lg bg-emerald-50 p-3 text-xs text-slate-700 overflow-x-auto">{JSON.stringify(e.new_value, null, 2)}</pre>
                                </div>
                              )}
                              {e.ip_address && (
                                <div className="sm:col-span-2 text-xs text-slate-500">IP Address: {e.ip_address}</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

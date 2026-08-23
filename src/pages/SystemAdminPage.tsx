import { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck, Settings, FileText, ToggleLeft, ToggleRight,
  Save, Plus, Trash2, Edit2, X, AlertCircle, LayoutGrid, Sliders,
  FileBarChart, AlertTriangle, Eye, Send, Layers, Wand2,
  Database, ListChecks, Clock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { cls } from '../lib/utils';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui';
import type { ConfigEntry, CustomPage, CustomPageField, CustomPageChart, CustomPageButton, RFConfig, RFEscalationLevel, RFEscalationAction, Project, WorkflowStep } from '../types';

const CATEGORIES = [
  { key: 'pages', label: 'Pages & Navigation', icon: LayoutGrid, description: 'Enable, disable, and rename system pages' },
  { key: 'features', label: 'System Features', icon: ToggleLeft, description: 'Toggle system features on or off' },
  { key: 'settings', label: 'System Settings', icon: Sliders, description: 'Configure system-wide parameters' },
  { key: 'clearance_types', label: 'Clearance Types', icon: Trash2, description: 'Add, edit, or remove data clearance types used by the Data Clearance page' },
  { key: 'master_data', label: 'Master Data', icon: Database, description: 'Manage lookup values and reference data used across the system' },
  { key: 'page_builder', label: 'Dynamic Page Builder', icon: Wand2, description: 'Create and manage custom pages without code' },
  { key: 'rf_config', label: 'Repeated Failure Config', icon: AlertTriangle, description: 'Configure repeated failure rules and escalation levels' },
] as const;

const PAGE_TYPES = ['Dashboard', 'Form', 'Report', 'Analysis', 'Table', 'Custom Page'];
const FIELD_TYPES = ['text', 'number', 'date', 'select', 'textarea', 'checkbox', 'email', 'tel'];
const CHART_TYPES = ['bar', 'line', 'pie', 'table', 'metric'];
const DATA_SOURCES = ['evaluations', 'coaching_sessions', 'agents', 'calibration_sessions', 'projects', 'audit_history'];
const ROLES = ['admin', 'operation', 'coach', 'quality', 'quality_expert', 'manager', 'agent'];
const ACTION_TYPES = ['coaching', 'training', 'monitoring', 'notify', 'escalate_manager', 'pip', 'written_warning', 'custom'];
const CLEARANCE_ICONS = ['FileText', 'CheckCircle2', 'ShieldCheck', 'Search', 'AlertTriangle', 'Clock', 'History', 'BarChart3', 'LayoutDashboard', 'Users'];

// Page name → tables[] mapping for clearance types (each page may clear multiple related tables)
const CLEARANCE_PAGE_MAP: { label: string; key: string; tables: { table: string; dateColumn: string }[] }[] = [
  { label: 'Evaluations', key: 'evaluations', tables: [{ table: 'evaluations', dateColumn: 'evaluation_date' }, { table: 'evaluation_root_causes', dateColumn: 'created_at' }] },
  { label: 'Repeated Failure', key: 'repeated_failure', tables: [{ table: 'repeated_failure_processes', dateColumn: 'created_at' }, { table: 'rf_assessments', dateColumn: 'created_at' }] },
  { label: 'Calibration', key: 'calibration', tables: [{ table: 'calibration_sessions', dateColumn: 'calibration_date' }, { table: 'calibration_evaluations', dateColumn: 'created_at' }] },
  { label: 'Reports', key: 'reporting', tables: [{ table: 'evaluations', dateColumn: 'evaluation_date' }] },
  { label: 'Analysis', key: 'analysis', tables: [{ table: 'analysis_suggestions', dateColumn: 'created_at' }, { table: 'custom_analyses', dateColumn: 'created_at' }] },
  { label: 'Dashboard', key: 'dashboard', tables: [{ table: 'evaluations', dateColumn: 'evaluation_date' }, { table: 'coaching_sessions', dateColumn: 'scheduled_date' }] },
  { label: 'Agent Performance & Coaching', key: 'agent_performance', tables: [{ table: 'coaching_sessions', dateColumn: 'scheduled_date' }, { table: 'evaluations', dateColumn: 'evaluation_date' }] },
];

export function SystemAdminPage() {
  const { profile, hasPermission, projects } = useAuth();
  const [activeCategory, setActiveCategory] = useState<string>('pages');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [editing, setEditing] = useState<ConfigEntry | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [customPages, setCustomPages] = useState<CustomPage[]>([]);
  const [editingPage, setEditingPage] = useState<CustomPage | null>(null);
  const [showPageBuilder, setShowPageBuilder] = useState(false);
  const [previewPage, setPreviewPage] = useState<CustomPage | null>(null);
  const [publishConfirm, setPublishConfirm] = useState<CustomPage | null>(null);

  const [rfConfigs, setRfConfigs] = useState<RFConfig[]>([]);
  const [editingRF, setEditingRF] = useState<RFConfig | null>(null);
  const [showRFEditor, setShowRFEditor] = useState(false);

  // Master data
  const [refOptions, setRefOptions] = useState<Record<string, { id: string; value: string; sort_order: number }[]>>({});
  const [masterDataLoading, setMasterDataLoading] = useState(false);
  const [editingRefKey, setEditingRefKey] = useState<string | null>(null);
  const [newRefValue, setNewRefValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: configData, error: configErr } = await supabase.from('system_config').select('*').order('category').order('sort_order');
      if (configErr) throw new Error(configErr.message);
      setEntries((configData ?? []) as ConfigEntry[]);

      const { data: pageData, error: pageErr } = await supabase.from('custom_pages').select('*').order('sort_order').order('created_at', { ascending: false });
      if (pageErr) throw new Error(pageErr.message);
      setCustomPages((pageData ?? []) as CustomPage[]);

      const { data: rfData, error: rfErr } = await supabase.from('rf_config').select('*').order('sort_order').order('created_at', { ascending: false });
      if (rfErr) throw new Error(rfErr.message);
      setRfConfigs((rfData ?? []) as RFConfig[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load master data reference options when tab is selected
  const loadRefOptions = useCallback(async (key: string) => {
    setMasterDataLoading(true);
    const { data, error } = await supabase.from('reference_options').select('*').eq('category', key).order('sort_order');
    if (error) { setRefOptions((prev) => ({ ...prev, [key]: [] })); }
    else setRefOptions((prev) => ({ ...prev, [key]: (data ?? []) as { id: string; value: string; sort_order: number }[] }));
    setMasterDataLoading(false);
  }, []);

  if (!hasPermission('manage_system_admin')) {
    return <ErrorState message="You do not have permission to access this page." />;
  }
  if (loading) return <LoadingState label="Loading system configuration…" />;
  if (error) return <ErrorState message={error} />;

  const cat = CATEGORIES.find((c) => c.key === activeCategory)!;
  const filtered = entries.filter((e) => e.category === activeCategory);

  // === Config handlers (pages, features, settings, clearance_types) ===
  const handleToggle = async (entry: ConfigEntry) => {
    const newVal = !entry.active;
    const oldVal = entry.active;
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, active: newVal } : e)));
    const { error } = await supabase.from('system_config').update({ active: newVal, updated_at: new Date().toISOString(), updated_by: profile?.id }).eq('id', entry.id);
    if (error) { setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, active: oldVal } : e))); setSaveError(error.message); return; }
    logAudit({ action: newVal ? 'enable' : 'disable', entity_type: 'system_config', entity_id: entry.id, page_module: 'system_admin', old_value: { active: oldVal }, new_value: { active: newVal } });
  };

  const handleSave = async (entry: ConfigEntry) => {
    const { error } = await supabase.from('system_config').update({ label: entry.label, description: entry.description, value: entry.value, sort_order: entry.sort_order, updated_at: new Date().toISOString(), updated_by: profile?.id }).eq('id', entry.id);
    if (error) { setSaveError(error.message); return; }
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)));
    logAudit({ action: 'update', entity_type: 'system_config', entity_id: entry.id, page_module: 'system_admin', new_value: { label: entry.label, description: entry.description, value: entry.value } });
    setEditing(null);
  };

  const handleDelete = async (entry: ConfigEntry) => {
    if (!confirm(`Delete "${entry.label ?? entry.key}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('system_config').delete().eq('id', entry.id);
    if (error) { setSaveError(error.message); return; }
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    logAudit({ action: 'delete', entity_type: 'system_config', entity_id: entry.id, page_module: 'system_admin', old_value: { label: entry.label, key: entry.key } });
  };

  const handleAdd = async (entry: { category: string; key: string; label: string; description: string; value: string }) => {
    let parsedValue: Record<string, unknown> = {};
    try { parsedValue = JSON.parse(entry.value); } catch { parsedValue = { value: entry.value }; }
    const { data, error } = await supabase.from('system_config').insert({ category: entry.category, key: entry.key, label: entry.label, description: entry.description, value: parsedValue, sort_order: 99, active: true, updated_by: profile?.id }).select('*').single();
    if (error) { setSaveError(error.message); return; }
    setEntries((prev) => [...prev, data as ConfigEntry]);
    logAudit({ action: 'create', entity_type: 'system_config', entity_id: data.id, page_module: 'system_admin', new_value: { category: entry.category, key: entry.key, label: entry.label } });
    setShowAdd(false);
  };

  // === Master data handlers ===
  const handleAddRefOption = async (category: string) => {
    if (!newRefValue.trim()) return;
    const { data, error } = await supabase.from('reference_options').insert({ category, value: newRefValue.trim(), sort_order: 99 }).select('*').single();
    if (error) { setSaveError(error.message); return; }
    setRefOptions((prev) => ({ ...prev, [category]: [...(prev[category] ?? []), data as { id: string; value: string; sort_order: number }] }));
    setNewRefValue('');
    logAudit({ action: 'create', entity_type: 'reference_options', entity_id: data.id, page_module: 'system_admin', new_value: { category, value: newRefValue.trim() } });
  };

  const handleDeleteRefOption = async (category: string, id: string, value: string) => {
    if (!confirm(`Delete "${value}"?`)) return;
    const { error } = await supabase.from('reference_options').delete().eq('id', id);
    if (error) { setSaveError(error.message); return; }
    setRefOptions((prev) => ({ ...prev, [category]: (prev[category] ?? []).filter((r) => r.id !== id) }));
    logAudit({ action: 'delete', entity_type: 'reference_options', entity_id: id, page_module: 'system_admin', old_value: { category, value } });
  };

  // === Page builder handlers ===
  const handleSavePage = async (page: CustomPage, publish: boolean) => {
    const payload = {
      title: page.title,
      description: page.description,
      page_type: page.page_type,
      slug: page.slug || page.title.toLowerCase().replace(/\s+/g, '-'),
      layout: page.layout,
      fields: page.fields,
      filters: page.filters,
      charts: page.charts,
      tables: page.tables,
      buttons: page.buttons,
      actions: page.actions,
      workflows: page.workflows,
      permissions: page.permissions,
      status: publish ? 'published' : 'draft',
      sort_order: page.sort_order,
      updated_at: new Date().toISOString(),
    };
    if (page.id) {
      const { error } = await supabase.from('custom_pages').update(payload).eq('id', page.id);
      if (error) { setSaveError(error.message); return; }
      logAudit({ action: publish ? 'publish' : 'update', entity_type: 'custom_page', entity_id: page.id, page_module: 'system_admin', new_value: { title: page.title, status: payload.status } });
    } else {
      const { data, error } = await supabase.from('custom_pages').insert({ ...payload, created_by: profile?.id }).select('*').single();
      if (error) { setSaveError(error.message); return; }
      logAudit({ action: publish ? 'publish' : 'create', entity_type: 'custom_page', entity_id: data.id, page_module: 'system_admin', new_value: { title: page.title, status: payload.status } });
    }
    await load();
    setShowPageBuilder(false);
    setEditingPage(null);
  };

  const handleTogglePage = async (page: CustomPage) => {
    const newStatus = page.status === 'published' ? 'disabled' : 'published';
    const { error } = await supabase.from('custom_pages').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', page.id);
    if (error) { setSaveError(error.message); return; }
    setCustomPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, status: newStatus } : p)));
    logAudit({ action: newStatus === 'published' ? 'publish' : 'disable', entity_type: 'custom_page', entity_id: page.id, page_module: 'system_admin', new_value: { status: newStatus } });
  };

  const handleDeletePage = async (page: CustomPage) => {
    if (!confirm(`Delete page "${page.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('custom_pages').delete().eq('id', page.id);
    if (error) { setSaveError(error.message); return; }
    setCustomPages((prev) => prev.filter((p) => p.id !== page.id));
    logAudit({ action: 'delete', entity_type: 'custom_page', entity_id: page.id, page_module: 'system_admin', old_value: { title: page.title } });
  };

  // === RF config handlers ===
  const handleSaveRF = async (config: RFConfig) => {
    const payload = {
      name: config.name,
      description: config.description,
      project_id: config.project_id || null,
      monitoring_period_months: config.monitoring_period_months,
      customer_critical_threshold: config.customer_critical_threshold,
      business_critical_threshold: config.business_critical_threshold,
      compliance_critical_threshold: config.compliance_critical_threshold,
      non_critical_threshold: config.non_critical_threshold,
      total_failed_evaluations: config.total_failed_evaluations,
      combined_critical_threshold: config.combined_critical_threshold,
      pass_fail_condition: config.pass_fail_condition,
      rules: config.rules,
      active: config.active,
      sort_order: config.sort_order,
      updated_at: new Date().toISOString(),
    };
    if (config.id) {
      const { error } = await supabase.from('rf_config').update(payload).eq('id', config.id);
      if (error) { setSaveError(error.message); return; }
      logAudit({ action: 'update', entity_type: 'rf_config', entity_id: config.id, page_module: 'system_admin', new_value: payload });
    } else {
      const { data, error } = await supabase.from('rf_config').insert({ ...payload, created_by: profile?.id }).select('*').single();
      if (error) { setSaveError(error.message); return; }
      logAudit({ action: 'create', entity_type: 'rf_config', entity_id: data.id, page_module: 'system_admin', new_value: payload });
    }
    await load();
    setShowRFEditor(false);
    setEditingRF(null);
  };

  const handleToggleRF = async (config: RFConfig) => {
    const { error } = await supabase.from('rf_config').update({ active: !config.active, updated_at: new Date().toISOString() }).eq('id', config.id);
    if (error) { setSaveError(error.message); return; }
    setRfConfigs((prev) => prev.map((c) => (c.id === config.id ? { ...c, active: !c.active } : c)));
    logAudit({ action: config.active ? 'disable' : 'enable', entity_type: 'rf_config', entity_id: config.id, page_module: 'system_admin', new_value: { active: !config.active } });
  };

  const handleDeleteRF = async (config: RFConfig) => {
    if (!confirm(`Delete RF configuration "${config.name}"?`)) return;
    const { error } = await supabase.from('rf_config').delete().eq('id', config.id);
    if (error) { setSaveError(error.message); return; }
    setRfConfigs((prev) => prev.filter((c) => c.id !== config.id));
    logAudit({ action: 'delete', entity_type: 'rf_config', entity_id: config.id, page_module: 'system_admin', old_value: { name: config.name } });
  };

  const isConfigCategory = activeCategory === 'pages' || activeCategory === 'features' || activeCategory === 'settings' || activeCategory === 'clearance_types';
  const isClearanceType = activeCategory === 'clearance_types';

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Administration"
        subtitle="Full administrative control — create pages, configure settings, manage master data, and more"
        actions={
          isConfigCategory ? (
            <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="h-4 w-4" /> Add {isClearanceType ? 'Clearance Type' : 'Configuration'}</button>
          ) : activeCategory === 'master_data' ? null : activeCategory === 'page_builder' ? (
            <button onClick={() => { setEditingPage(null); setShowPageBuilder(true); }} className="btn-primary"><Plus className="h-4 w-4" /> Create Page</button>
          ) : activeCategory === 'rf_config' ? (
            <button onClick={() => { setEditingRF(null); setShowRFEditor(true); }} className="btn-primary"><Plus className="h-4 w-4" /> Add Rule Set</button>
          ) : null
        }
      />

      {saveError && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4" /> {saveError}
          <button onClick={() => setSaveError(null)} className="ml-auto text-rose-400 hover:text-rose-600"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {CATEGORIES.map((c) => (
          <button key={c.key} onClick={() => setActiveCategory(c.key)}
            className={cls('flex shrink-0 items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeCategory === c.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            <c.icon className="h-4 w-4" /> {c.label}
          </button>
        ))}
      </div>

      {/* Config-based categories (pages, features, settings, clearance_types) */}
      {isConfigCategory && (
        <div className="card p-4">
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
            <cat.icon className="h-4 w-4 text-brand-600" /> {cat.description}
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon={<Settings className="h-10 w-10" />} title="No configurations" subtitle="Add a configuration entry to get started" />
          ) : (
            <div className="space-y-2">
              {filtered.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3 transition hover:border-slate-200">
                  {editing?.id === entry.id ? (
                    <EditRow entry={editing} onChange={setEditing} onSave={() => handleSave(editing)} onCancel={() => setEditing(null)} isClearanceType={isClearanceType} />
                  ) : (
                    <>
                      <button onClick={() => handleToggle(entry)} className="shrink-0">
                        {entry.active ? <ToggleRight className="h-6 w-6 text-emerald-600" /> : <ToggleLeft className="h-6 w-6 text-slate-300" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-700">{entry.label ?? entry.key}</div>
                        <div className="text-xs text-slate-400">{entry.description ?? entry.key}</div>
                        {isClearanceType && (
                          <div className="mt-0.5 text-xs text-slate-400 font-mono">
                            table: {(entry.value as { table?: string }).table ?? '—'} · date: {(entry.value as { dateColumn?: string }).dateColumn ?? '—'}
                          </div>
                        )}
                        {!isClearanceType && <div className="mt-0.5 text-xs text-slate-400 font-mono">{entry.key}</div>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditing(entry)} className="btn-ghost p-1.5"><Edit2 className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(entry)} className="btn-ghost p-1.5 text-rose-500 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Master Data */}
      {activeCategory === 'master_data' && (
        <div className="card p-4">
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
            <Database className="h-4 w-4 text-brand-600" /> {cat.description}
          </div>
          <div className="space-y-4">
            {filtered.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-100">
                <button
                  onClick={() => {
                    if (editingRefKey === entry.key) { setEditingRefKey(null); }
                    else { setEditingRefKey(entry.key); loadRefOptions(entry.key); }
                  }}
                  className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-slate-50"
                >
                  <ListChecks className="h-5 w-5 text-slate-400" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-700">{entry.label ?? entry.key}</div>
                    <div className="text-xs text-slate-400">{entry.description ?? ''}</div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    {refOptions[entry.key]?.length ?? '—'} values
                  </span>
                  {editingRefKey === entry.key ? <X className="h-4 w-4 text-slate-400" /> : <Edit2 className="h-4 w-4 text-slate-400" />}
                </button>
                {editingRefKey === entry.key && (
                  <div className="border-t border-slate-100 p-3">
                    {masterDataLoading ? (
                      <p className="text-sm text-slate-400">Loading…</p>
                    ) : (
                      <>
                        <div className="mb-3 flex flex-wrap gap-2">
                          {(refOptions[entry.key] ?? []).map((opt) => (
                            <span key={opt.id} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1.5 text-sm text-slate-700">
                              {opt.value}
                              <button onClick={() => handleDeleteRefOption(entry.key, opt.id, opt.value)} className="rounded-full p-0.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
                            </span>
                          ))}
                          {(refOptions[entry.key] ?? []).length === 0 && <p className="text-xs text-slate-400">No values yet.</p>}
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={newRefValue}
                            onChange={(e) => setNewRefValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { handleAddRefOption(entry.key); } }}
                            placeholder="Add a new value…"
                            className="input flex-1"
                          />
                          <button onClick={() => handleAddRefOption(entry.key)} disabled={!newRefValue.trim()} className="btn-primary text-sm"><Plus className="h-4 w-4" /> Add</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dynamic Page Builder */}
      {activeCategory === 'page_builder' && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
              <Wand2 className="h-4 w-4 text-brand-600" /> {cat.description}
            </div>
            {customPages.length === 0 ? (
              <EmptyState icon={<Layers className="h-10 w-10" />} title="No custom pages yet" subtitle="Create a new page to get started — no coding required" />
            ) : (
              <div className="space-y-2">
                {customPages.map((page) => (
                  <div key={page.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3 transition hover:border-slate-200">
                    <button onClick={() => handleTogglePage(page)} className="shrink-0">
                      {page.status === 'published' ? <ToggleRight className="h-6 w-6 text-emerald-600" /> : <ToggleLeft className="h-6 w-6 text-slate-300" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-700">{page.title}</span>
                        <span className={cls('rounded-full px-2 py-0.5 text-xs font-medium',
                          page.status === 'published' ? 'bg-emerald-50 text-emerald-700' :
                          page.status === 'draft' ? 'bg-amber-50 text-amber-700' :
                          'bg-slate-100 text-slate-500')}>{page.status}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{page.page_type}</span>
                      </div>
                      <div className="text-xs text-slate-400">{page.description ?? 'No description'}</div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {page.fields.length} fields · {page.charts.length} charts · {page.buttons.length} buttons · {page.workflows.length} workflow steps
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setPreviewPage(page)} className="btn-ghost p-1.5" title="Preview"><Eye className="h-4 w-4" /></button>
                      <button onClick={() => { setEditingPage(page); setShowPageBuilder(true); }} className="btn-ghost p-1.5" title="Edit"><Edit2 className="h-4 w-4" /></button>
                      <button onClick={() => setPublishConfirm(page)} className="btn-ghost p-1.5 text-brand-600" title="Publish"><Send className="h-4 w-4" /></button>
                      <button onClick={() => handleDeletePage(page)} className="btn-ghost p-1.5 text-rose-500 hover:text-rose-700" title="Delete"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RF Configuration */}
      {activeCategory === 'rf_config' && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
              <AlertTriangle className="h-4 w-4 text-brand-600" /> {cat.description}
            </div>
            {rfConfigs.length === 0 ? (
              <EmptyState icon={<AlertTriangle className="h-10 w-10" />} title="No RF configurations" subtitle="Create a rule set to configure repeated failure detection" />
            ) : (
              <div className="space-y-3">
                {rfConfigs.map((config) => (
                  <div key={config.id} className="rounded-lg border border-slate-100 p-4 transition hover:border-slate-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button onClick={() => handleToggleRF(config)} className="shrink-0">
                          {config.active ? <ToggleRight className="h-6 w-6 text-emerald-600" /> : <ToggleLeft className="h-6 w-6 text-slate-300" />}
                        </button>
                        <div>
                          <div className="text-sm font-semibold text-slate-700">{config.name}</div>
                          <div className="text-xs text-slate-400">{config.description ?? 'No description'}</div>
                          <div className="mt-0.5 text-xs text-slate-400">
                            {config.monitoring_period_months} months ·
                            Customer: {config.customer_critical_threshold} ·
                            Business: {config.business_critical_threshold} ·
                            Compliance: {config.compliance_critical_threshold} ·
                            Non-Critical: {config.non_critical_threshold} ·
                            {config.rules.length} escalation levels
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditingRF(config); setShowRFEditor(true); }} className="btn-ghost p-1.5"><Edit2 className="h-4 w-4" /></button>
                        <button onClick={() => handleDeleteRF(config)} className="btn-ghost p-1.5 text-rose-500 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    {config.rules.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {config.rules.map((rule, i) => (
                          <span key={i} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                            Level {rule.level}: {rule.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showAdd && <AddConfigModal category={activeCategory} isClearanceType={isClearanceType} onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
      {showPageBuilder && <PageBuilderModal page={editingPage} projects={projects} onClose={() => { setShowPageBuilder(false); setEditingPage(null); }} onSave={handleSavePage} />}
      {previewPage && <PagePreviewModal page={previewPage} onClose={() => setPreviewPage(null)} />}
      {publishConfirm && <PublishConfirmModal page={publishConfirm} onClose={() => setPublishConfirm(null)} onConfirm={() => { handleSavePage(publishConfirm, true); setPublishConfirm(null); }} />}
      {showRFEditor && <RFConfigEditorModal config={editingRF} projects={projects} onClose={() => { setShowRFEditor(false); setEditingRF(null); }} onSave={handleSaveRF} />}
    </div>
  );
}

// ====== Edit Row (config) ======
function EditRow({ entry, onChange, onSave, onCancel, isClearanceType }: {
  entry: ConfigEntry;
  onChange: (e: ConfigEntry) => void;
  onSave: () => void;
  onCancel: () => void;
  isClearanceType?: boolean;
}) {
  const valueStr = typeof entry.value === 'object' ? JSON.stringify(entry.value, null, 2) : String(entry.value);
  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex gap-2">
        <input value={entry.label ?? ''} onChange={(e) => onChange({ ...entry, label: e.target.value })} placeholder="Label" className="input flex-1" />
        <input type="number" value={entry.sort_order} onChange={(e) => onChange({ ...entry, sort_order: parseInt(e.target.value) || 0 })} className="input w-20" />
      </div>
      <input value={entry.description ?? ''} onChange={(e) => onChange({ ...entry, description: e.target.value })} placeholder="Description" className="input" />
      {isClearanceType ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="label">Page to Clear</label>
            <select
              value={CLEARANCE_PAGE_MAP.find((p) => {
                const entryTables = Array.isArray((entry.value as { tables?: unknown[] }).tables)
                  ? (entry.value as { tables: { table: string }[] }).tables.map((t) => t.table)
                  : [(entry.value as { table?: string }).table ?? ''];
                return p.tables.length === entryTables.length && p.tables.every((t, i) => t.table === entryTables[i]);
              })?.key ?? ''}
              onChange={(e) => {
                const page = CLEARANCE_PAGE_MAP.find((p) => p.key === e.target.value);
                if (page) onChange({ ...entry, value: { ...entry.value, tables: page.tables } });
              }}
              className="input"
            >
              <option value="">Custom (edit tables below)</option>
              {CLEARANCE_PAGE_MAP.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Tables (JSON)</label>
            <textarea
              value={JSON.stringify((entry.value as { tables?: { table: string; dateColumn: string }[] }).tables ?? [], null, 2)}
              onChange={(e) => { try { onChange({ ...entry, value: { ...entry.value, tables: JSON.parse(e.target.value) } }); } catch { /* allow invalid while typing */ } }}
              rows={4}
              className="input font-mono text-xs"
            />
          </div>
          <div className="col-span-2">
            <label className="label">Icon</label>
            <select value={(entry.value as { icon?: string }).icon ?? 'FileText'} onChange={(e) => onChange({ ...entry, value: { ...entry.value, icon: e.target.value } })} className="input">
              {CLEARANCE_ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <textarea value={valueStr} onChange={(e) => { try { onChange({ ...entry, value: JSON.parse(e.target.value) }); } catch { /* allow invalid while typing */ } }} rows={3} className="input font-mono text-xs" />
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
        <button onClick={onSave} className="btn-primary text-sm"><Save className="h-4 w-4" /> Save</button>
      </div>
    </div>
  );
}

// ====== Add Config Modal ======
function AddConfigModal({ category, isClearanceType, onClose, onAdd }: {
  category: string;
  isClearanceType: boolean;
  onClose: () => void;
  onAdd: (entry: { category: string; key: string; label: string; description: string; value: string }) => void;
}) {
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [pageKey, setPageKey] = useState('');
  const [icon, setIcon] = useState('FileText');
  const [value, setValue] = useState('{}');

  const handleAdd = () => {
    const page = CLEARANCE_PAGE_MAP.find((p) => p.key === pageKey);
    if (isClearanceType) {
      const val = page
        ? JSON.stringify({ tables: page.tables, icon })
        : JSON.stringify({ tables: [], icon });
      onAdd({ category, key: key || pageKey, label: label || page?.label || '', description, value: val });
    } else {
      onAdd({ category, key, label, description, value });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{isClearanceType ? 'Add Clearance Type' : 'Add Configuration'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          {isClearanceType ? (
            <>
              <div>
                <label className="label">Page to Clear *</label>
                <select value={pageKey} onChange={(e) => { setPageKey(e.target.value); const p = CLEARANCE_PAGE_MAP.find((p) => p.key === e.target.value); if (p) { setKey(p.key); setLabel(p.label); } }} className="input">
                  <option value="">Select a page…</option>
                  {CLEARANCE_PAGE_MAP.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
              <div><label className="label">Key</label><input value={key} onChange={(e) => setKey(e.target.value)} placeholder="auto-filled from page selection" className="input" /></div>
              <div><label className="label">Label</label><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Display label" className="input" /></div>
              <div><label className="label">Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this clear?" className="input" /></div>
              <div>
                <label className="label">Icon</label>
                <select value={icon} onChange={(e) => setIcon(e.target.value)} className="input">
                  {CLEARANCE_ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div><label className="label">Key *</label><input value={key} onChange={(e) => setKey(e.target.value)} placeholder="unique_key" className="input" /></div>
              <div><label className="label">Label *</label><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Display label" className="input" /></div>
              <div><label className="label">Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this configure?" className="input" /></div>
              <div><label className="label">Value (JSON)</label><textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} className="input font-mono text-xs" /></div>
            </>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleAdd} disabled={isClearanceType ? !pageKey : !key.trim()} className="btn-primary"><Save className="h-4 w-4" /> Add</button>
        </div>
      </div>
    </div>
  );
}

// ====== Page Builder Modal ======
function PageBuilderModal({ page, projects, onClose, onSave }: {
  page: CustomPage | null;
  projects: Project[];
  onClose: () => void;
  onSave: (page: CustomPage, publish: boolean) => void;
}) {
  const [tab, setTab] = useState<'details' | 'fields' | 'charts' | 'buttons' | 'permissions' | 'workflow'>('details');
  const [draft, setDraft] = useState<CustomPage>(() => page ?? {
    id: '', title: '', description: '', page_type: 'Custom Page', slug: '',
    layout: {}, fields: [], filters: [], charts: [], tables: [], buttons: [], actions: [], workflows: [],
    permissions: {}, status: 'draft', sort_order: 0, created_by: null, created_at: '', updated_at: '',
  });

  const update = (patch: Partial<CustomPage>) => setDraft((d) => ({ ...d, ...patch }));

  const addField = () => update({ fields: [...draft.fields, { id: `f_${Date.now()}`, label: '', type: 'text', required: false }] });
  const updateField = (id: string, patch: Partial<CustomPageField>) => update({ fields: draft.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const removeField = (id: string) => update({ fields: draft.fields.filter((f) => f.id !== id) });

  const addChart = () => update({ charts: [...draft.charts, { id: `c_${Date.now()}`, title: '', type: 'bar', data_source: 'evaluations', config: {} }] });
  const updateChart = (id: string, patch: Partial<CustomPageChart>) => update({ charts: draft.charts.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const removeChart = (id: string) => update({ charts: draft.charts.filter((c) => c.id !== id) });

  const addButton = () => update({ buttons: [...draft.buttons, { id: `b_${Date.now()}`, label: '', action: '', variant: 'primary' }] });
  const updateButton = (id: string, patch: Partial<CustomPageButton>) => update({ buttons: draft.buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  const removeButton = (id: string) => update({ buttons: draft.buttons.filter((b) => b.id !== id) });

  const togglePerm = (role: string) => {
    const perms = { ...draft.permissions };
    perms[role] = !perms[role];
    update({ permissions: perms });
  };

  // Workflow steps
  const addWorkflowStep = () => update({ workflows: [...draft.workflows, { step: draft.workflows.length + 1, name: '', role: 'admin', processing_hours: 24 }] });
  const updateWorkflowStep = (idx: number, patch: Partial<WorkflowStep>) => update({ workflows: draft.workflows.map((w, i) => (i === idx ? { ...w, ...patch } : w)) });
  const removeWorkflowStep = (idx: number) => update({ workflows: draft.workflows.filter((_, i) => i !== idx).map((w, i) => ({ ...w, step: i + 1 })) });

  const BUILDER_TABS = [
    { key: 'details', label: 'Details' },
    { key: 'fields', label: 'Fields' },
    { key: 'charts', label: 'Charts & Tables' },
    { key: 'buttons', label: 'Buttons & Actions' },
    { key: 'permissions', label: 'Permissions' },
    { key: 'workflow', label: 'Workflow' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{page ? 'Edit Page' : 'Create New Page'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-4 flex gap-1 border-b border-slate-200">
          {BUILDER_TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cls('px-3 py-2 text-sm font-medium border-b-2 transition',
                tab === t.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Details tab */}
        {tab === 'details' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Page Title *</label><input value={draft.title} onChange={(e) => update({ title: e.target.value })} placeholder="e.g. Reported Files" className="input" /></div>
              <div><label className="label">Slug</label><input value={draft.slug} onChange={(e) => update({ slug: e.target.value })} placeholder="auto-generated if empty" className="input" /></div>
            </div>
            <div><label className="label">Description</label><input value={draft.description ?? ''} onChange={(e) => update({ description: e.target.value })} placeholder="What is this page for?" className="input" /></div>
            <div>
              <label className="label">Page Type</label>
              <div className="flex flex-wrap gap-2">
                {PAGE_TYPES.map((t) => (
                  <button key={t} onClick={() => update({ page_type: t })}
                    className={cls('rounded-lg border px-3 py-1.5 text-sm font-medium transition',
                      draft.page_type === t ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div><label className="label">Sort Order</label><input type="number" value={draft.sort_order} onChange={(e) => update({ sort_order: Number(e.target.value) })} className="input w-24" /></div>
          </div>
        )}

        {/* Fields tab */}
        {tab === 'fields' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">Add custom fields to collect data on this page.</p>
              <button onClick={addField} className="btn-secondary text-sm"><Plus className="h-4 w-4" /> Add Field</button>
            </div>
            {draft.fields.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No fields yet. Click "Add Field" to create one.</p>
            ) : (
              draft.fields.map((f, i) => (
                <div key={f.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Field {i + 1}</span>
                    <button onClick={() => removeField(f.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={f.label} onChange={(e) => updateField(f.id, { label: e.target.value })} placeholder="Field label" className="input" />
                    <select value={f.type} onChange={(e) => updateField(f.id, { type: e.target.value as CustomPageField['type'] })} className="input">
                      {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="mt-2 flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input type="checkbox" checked={f.required} onChange={(e) => updateField(f.id, { required: e.target.checked })} className="rounded" />
                      Required
                    </label>
                    {(f.type === 'select') && (
                      <input value={f.options?.join(', ') ?? ''} onChange={(e) => updateField(f.id, { options: e.target.value.split(',').map((s) => s.trim()) })} placeholder="Option 1, Option 2" className="input flex-1 text-sm" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Charts tab */}
        {tab === 'charts' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">Add charts and tables to visualize data.</p>
              <button onClick={addChart} className="btn-secondary text-sm"><Plus className="h-4 w-4" /> Add Chart</button>
            </div>
            {draft.charts.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No charts yet. Click "Add Chart" to create one.</p>
            ) : (
              draft.charts.map((c, i) => (
                <div key={c.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Chart {i + 1}</span>
                    <button onClick={() => removeChart(c.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input value={c.title} onChange={(e) => updateChart(c.id, { title: e.target.value })} placeholder="Chart title" className="input" />
                    <select value={c.type} onChange={(e) => updateChart(c.id, { type: e.target.value as CustomPageChart['type'] })} className="input">
                      {CHART_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select value={c.data_source} onChange={(e) => updateChart(c.id, { data_source: e.target.value })} className="input">
                      {DATA_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Buttons tab */}
        {tab === 'buttons' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">Add buttons and actions to the page.</p>
              <button onClick={addButton} className="btn-secondary text-sm"><Plus className="h-4 w-4" /> Add Button</button>
            </div>
            {draft.buttons.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No buttons yet. Click "Add Button" to create one.</p>
            ) : (
              draft.buttons.map((b, i) => (
                <div key={b.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Button {i + 1}</span>
                    <button onClick={() => removeButton(b.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input value={b.label} onChange={(e) => updateButton(b.id, { label: e.target.value })} placeholder="Button label" className="input" />
                    <input value={b.action} onChange={(e) => updateButton(b.id, { action: e.target.value })} placeholder="Action (e.g. export, submit)" className="input" />
                    <select value={b.variant} onChange={(e) => updateButton(b.id, { variant: e.target.value as CustomPageButton['variant'] })} className="input">
                      <option value="primary">Primary</option>
                      <option value="secondary">Secondary</option>
                      <option value="ghost">Ghost</option>
                    </select>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Permissions tab */}
        {tab === 'permissions' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Select which roles can access this page.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ROLES.map((role) => (
                <button key={role} onClick={() => togglePerm(role)}
                  className={cls('flex items-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition',
                    draft.permissions[role] ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                  {draft.permissions[role] ? <ToggleRight className="h-4 w-4 text-brand-600" /> : <ToggleLeft className="h-4 w-4 text-slate-300" />}
                  <span className="capitalize">{role}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Workflow tab — with processing hours */}
        {tab === 'workflow' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">Define the processing workflow for this page. Each step has an assigned role and processing hours (SLA).</p>
              <button onClick={addWorkflowStep} className="btn-secondary text-sm"><Plus className="h-4 w-4" /> Add Step</button>
            </div>
            {draft.workflows.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No workflow steps yet. Click "Add Step" to define the processing flow.</p>
            ) : (
              <div className="space-y-2">
                {draft.workflows.map((w, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{w.step}</span>
                        Step {w.step}
                      </span>
                      <button onClick={() => removeWorkflowStep(idx)} className="text-rose-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <input value={w.name} onChange={(e) => updateWorkflowStep(idx, { name: e.target.value })} placeholder="Step name (e.g. Submit)" className="input" />
                      <select value={w.role} onChange={(e) => updateWorkflowStep(idx, { role: e.target.value })} className="input">
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <div className="relative">
                        <input type="number" min={0} value={w.processing_hours ?? 0} onChange={(e) => updateWorkflowStep(idx, { processing_hours: Number(e.target.value) })} placeholder="Hours" className="input pr-10" />
                        <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      </div>
                      <input value={w.description ?? ''} onChange={(e) => updateWorkflowStep(idx, { description: e.target.value })} placeholder="Description (optional)" className="input" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => onSave(draft, false)} disabled={!draft.title.trim()} className="btn-secondary">
            <Save className="h-4 w-4" /> Save as Draft
          </button>
          <button onClick={() => onSave(draft, true)} disabled={!draft.title.trim()} className="btn-primary">
            <Send className="h-4 w-4" /> Publish
          </button>
        </div>
      </div>
    </div>
  );
}

// ====== Page Preview Modal ======
function PagePreviewModal({ page, onClose }: { page: CustomPage; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Preview: {page.title}</h2>
            <p className="text-sm text-slate-500">{page.description ?? 'No description'}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          {page.fields.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Form Fields</h3>
              <div className="grid grid-cols-2 gap-3">
                {page.fields.map((f) => (
                  <div key={f.id}>
                    <label className="label">{f.label || 'Untitled'} {f.required && <span className="text-rose-500">*</span>}</label>
                    {f.type === 'textarea' ? <textarea disabled className="input" placeholder={`(${f.type})`} /> :
                     f.type === 'select' ? <select disabled className="input"><option>Select…</option>{f.options?.map((o) => <option key={o}>{o}</option>)}</select> :
                     f.type === 'checkbox' ? <input type="checkbox" disabled className="rounded" /> :
                     <input disabled type={f.type} className="input" placeholder={`(${f.type})`} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {page.charts.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Charts & Tables</h3>
              <div className="grid grid-cols-2 gap-3">
                {page.charts.map((c) => (
                  <div key={c.id} className="rounded-lg bg-slate-50 p-4 text-center">
                    <FileBarChart className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">{c.title || 'Untitled Chart'}</p>
                    <p className="text-xs text-slate-400">{c.type} · {c.data_source}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {page.buttons.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Buttons & Actions</h3>
              <div className="flex flex-wrap gap-2">
                {page.buttons.map((b) => (
                  <button key={b.id} disabled className={cls('text-sm',
                    b.variant === 'primary' ? 'btn-primary' : b.variant === 'secondary' ? 'btn-secondary' : 'btn-ghost')}>
                    {b.label || 'Button'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {page.workflows.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Workflow</h3>
              <div className="space-y-2">
                {page.workflows.map((w, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{w.step}</span>
                    <span className="font-medium text-slate-700">{w.name}</span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs capitalize text-slate-500">{w.role}</span>
                    {w.processing_hours != null && w.processing_hours > 0 && (
                      <>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3 w-3" /> {w.processing_hours}h SLA</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Role Permissions</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(page.permissions).filter(([, v]) => v).map(([role]) => (
                <span key={role} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium capitalize text-brand-700">{role}</span>
              ))}
              {Object.values(page.permissions).every((v) => !v) && <span className="text-xs text-slate-400">No roles assigned</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ====== Publish Confirmation Modal ======
function PublishConfirmModal({ page, onClose, onConfirm }: { page: CustomPage; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-600">
            <Send className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Confirm Publish</h2>
        </div>
        <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
          <div><span className="text-slate-500">Title:</span> <span className="font-medium text-slate-800">{page.title}</span></div>
          <div><span className="text-slate-500">Type:</span> <span className="font-medium text-slate-800">{page.page_type}</span></div>
          <div><span className="text-slate-500">Fields:</span> <span className="font-medium text-slate-800">{page.fields.length}</span></div>
          <div><span className="text-slate-500">Charts:</span> <span className="font-medium text-slate-800">{page.charts.length}</span></div>
          <div><span className="text-slate-500">Buttons:</span> <span className="font-medium text-slate-800">{page.buttons.length}</span></div>
          <div><span className="text-slate-500">Workflow steps:</span> <span className="font-medium text-slate-800">{page.workflows.length}</span></div>
          <div><span className="text-slate-500">Roles:</span> <span className="font-medium text-slate-800">{Object.entries(page.permissions).filter(([, v]) => v).map(([r]) => r).join(', ') || 'None'}</span></div>
        </div>
        <p className="mt-3 text-sm text-slate-500">Once published, this page will be visible to users with the assigned roles. You can disable it at any time.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={onConfirm} className="btn-primary"><Send className="h-4 w-4" /> Confirm & Publish</button>
        </div>
      </div>
    </div>
  );
}

// ====== RF Config Editor Modal ======
function RFConfigEditorModal({ config, projects, onClose, onSave }: {
  config: RFConfig | null;
  projects: Project[];
  onClose: () => void;
  onSave: (config: RFConfig) => void;
}) {
  const [draft, setDraft] = useState<RFConfig>(() => config ?? {
    id: '', name: '', description: '', project_id: null,
    monitoring_period_months: 4, customer_critical_threshold: 2, business_critical_threshold: 2,
    compliance_critical_threshold: 2, non_critical_threshold: 4, total_failed_evaluations: 0,
    combined_critical_threshold: 3, pass_fail_condition: 'pass', rules: [], active: true,
    sort_order: 0, created_by: null, created_at: '', updated_at: '',
  });

  const update = (patch: Partial<RFConfig>) => setDraft((d) => ({ ...d, ...patch }));

  const addLevel = () => {
    const nextLevel = draft.rules.length + 1;
    update({ rules: [...draft.rules, { level: nextLevel, name: `Level ${nextLevel}`, conditions: {}, actions: [] }] });
  };
  const updateLevel = (idx: number, patch: Partial<RFEscalationLevel>) => update({ rules: draft.rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)) });
  const removeLevel = (idx: number) => update({ rules: draft.rules.filter((_, i) => i !== idx).map((r, i) => ({ ...r, level: i + 1 })) });

  const addAction = (levelIdx: number) => {
    const rules = [...draft.rules];
    rules[levelIdx].actions.push({ name: '', type: 'custom' });
    update({ rules });
  };
  const updateAction = (levelIdx: number, actionIdx: number, patch: Partial<RFEscalationAction>) => {
    const rules = [...draft.rules];
    rules[levelIdx].actions[actionIdx] = { ...rules[levelIdx].actions[actionIdx], ...patch };
    update({ rules });
  };
  const removeAction = (levelIdx: number, actionIdx: number) => {
    const rules = [...draft.rules];
    rules[levelIdx].actions = rules[levelIdx].actions.filter((_, i) => i !== actionIdx);
    update({ rules });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{config ? 'Edit RF Configuration' : 'Create RF Configuration'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Rule Set Name *</label><input value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. Default RF Rules" className="input" /></div>
            <div>
              <label className="label">Project (optional — blank = all projects)</label>
              <select value={draft.project_id ?? ''} onChange={(e) => update({ project_id: e.target.value || null })} className="input">
                <option value="">All Projects</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div><label className="label">Description</label><input value={draft.description ?? ''} onChange={(e) => update({ description: e.target.value })} className="input" /></div>

          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Detection Thresholds</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div><label className="label">Monitoring Period (months)</label><input type="number" min={1} max={12} value={draft.monitoring_period_months} onChange={(e) => update({ monitoring_period_months: Number(e.target.value) })} className="input" /></div>
              <div><label className="label">Customer Critical Errors</label><input type="number" min={1} value={draft.customer_critical_threshold} onChange={(e) => update({ customer_critical_threshold: Number(e.target.value) })} className="input" /></div>
              <div><label className="label">Business Critical Errors</label><input type="number" min={1} value={draft.business_critical_threshold} onChange={(e) => update({ business_critical_threshold: Number(e.target.value) })} className="input" /></div>
              <div><label className="label">Compliance Critical Errors</label><input type="number" min={1} value={draft.compliance_critical_threshold} onChange={(e) => update({ compliance_critical_threshold: Number(e.target.value) })} className="input" /></div>
              <div><label className="label">Non-Critical Errors</label><input type="number" min={1} value={draft.non_critical_threshold} onChange={(e) => update({ non_critical_threshold: Number(e.target.value) })} className="input" /></div>
              <div><label className="label">Combined Critical Errors</label><input type="number" min={1} value={draft.combined_critical_threshold} onChange={(e) => update({ combined_critical_threshold: Number(e.target.value) })} className="input" /></div>
              <div><label className="label">Total Failed Evaluations</label><input type="number" min={0} value={draft.total_failed_evaluations} onChange={(e) => update({ total_failed_evaluations: Number(e.target.value) })} className="input" /></div>
              <div>
                <label className="label">Pass/Fail Condition</label>
                <select value={draft.pass_fail_condition} onChange={(e) => update({ pass_fail_condition: e.target.value })} className="input">
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Escalation Levels</h3>
              <button onClick={addLevel} className="btn-secondary text-sm"><Plus className="h-4 w-4" /> Add Level</button>
            </div>
            {draft.rules.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">No escalation levels yet. Click "Add Level" to create one.</p>
            ) : (
              <div className="space-y-3">
                {draft.rules.map((rule, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{rule.level}</span>
                        <input value={rule.name} onChange={(e) => updateLevel(idx, { name: e.target.value })} placeholder="Level name" className="input flex-1" />
                      </div>
                      <button onClick={() => removeLevel(idx)} className="text-rose-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="mb-2">
                      <p className="mb-1 text-xs font-medium text-slate-500">Conditions</p>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        <input type="number" min={0} value={rule.conditions.customer_critical ?? 0} onChange={(e) => updateLevel(idx, { conditions: { ...rule.conditions, customer_critical: Number(e.target.value) } })} placeholder="Customer" className="input text-xs" />
                        <input type="number" min={0} value={rule.conditions.business_critical ?? 0} onChange={(e) => updateLevel(idx, { conditions: { ...rule.conditions, business_critical: Number(e.target.value) } })} placeholder="Business" className="input text-xs" />
                        <input type="number" min={0} value={rule.conditions.compliance_critical ?? 0} onChange={(e) => updateLevel(idx, { conditions: { ...rule.conditions, compliance_critical: Number(e.target.value) } })} placeholder="Compliance" className="input text-xs" />
                        <input type="number" min={0} value={rule.conditions.non_critical ?? 0} onChange={(e) => updateLevel(idx, { conditions: { ...rule.conditions, non_critical: Number(e.target.value) } })} placeholder="Non-Critical" className="input text-xs" />
                        <input type="number" min={0} value={rule.conditions.combined_critical ?? 0} onChange={(e) => updateLevel(idx, { conditions: { ...rule.conditions, combined_critical: Number(e.target.value) } })} placeholder="Combined" className="input text-xs" />
                        <input type="number" min={0} value={rule.conditions.any_critical ?? 0} onChange={(e) => updateLevel(idx, { conditions: { ...rule.conditions, any_critical: Number(e.target.value) } })} placeholder="Any Critical" className="input text-xs" />
                        <input type="number" min={0} value={rule.conditions.total_failed ?? 0} onChange={(e) => updateLevel(idx, { conditions: { ...rule.conditions, total_failed: Number(e.target.value) } })} placeholder="Total Failed" className="input text-xs" />
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-slate-500">Actions</p>
                      <div className="space-y-1.5">
                        {rule.actions.map((action, aIdx) => (
                          <div key={aIdx} className="flex items-center gap-2">
                            <input value={action.name} onChange={(e) => updateAction(idx, aIdx, { name: e.target.value })} placeholder="Action name" className="input flex-1 text-sm" />
                            <select value={action.type} onChange={(e) => updateAction(idx, aIdx, { type: e.target.value })} className="input w-40 text-sm">
                              {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <button onClick={() => removeAction(idx, aIdx)} className="text-rose-400 hover:text-rose-600"><X className="h-4 w-4" /></button>
                          </div>
                        ))}
                        <button onClick={() => addAction(idx)} className="btn-ghost text-xs"><Plus className="h-3.5 w-3.5" /> Add Action</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={draft.active} onChange={(e) => update({ active: e.target.checked })} className="rounded" />
            Active
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => onSave(draft)} disabled={!draft.name.trim()} className="btn-primary"><Save className="h-4 w-4" /> Save Configuration</button>
        </div>
      </div>
    </div>
  );
}

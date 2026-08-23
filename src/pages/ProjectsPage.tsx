import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderKanban, Plus, X, Save, Edit2, Upload, Trash2, CheckCircle2, Tag, Layers,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import { cls, fmtDate } from '../lib/utils';
import { DEFAULT_FORM_CONFIG } from '../lib/scorecard';
import { useProjects } from '../lib/hooks';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui';
import { useL } from '../lib/labels';
import type { Project, FormConfig, FormCategory, FormItem, ScoringConfig } from '../types';

type ProjectDraft = {
  name: string;
  description: string;
  form_config: FormConfig;
  active: boolean;
  lob_config: string[];
  transaction_types: string[];
  lob_form_config: Record<string, FormConfig> | null;
};

const DEFAULT_LOB_OPTIONS = ['Inbound Calls', 'Outbound Calls', 'Email', 'Chat', 'Back Office'];
const DEFAULT_TRANSACTION_OPTIONS = ['Calls', 'Emails', 'Tickets', 'Validations', 'Chat', 'Follow Up'];

function emptyDraft(): ProjectDraft {
  return { name: '', description: '', form_config: DEFAULT_FORM_CONFIG, active: true, lob_config: [], transaction_types: [], lob_form_config: null };
}

export function ProjectsPage() {
  const L = useL();
  const { projects, loading, error, setProjects } = useProjects();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const openNew = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setModalError(null);
    setShowModal(true);
  };

  const openEdit = (project: Project) => {
    setEditing(project);
    setDraft({
      name: project.name,
      description: project.description,
      form_config: project.form_config ?? DEFAULT_FORM_CONFIG,
      active: project.active,
      lob_config: project.lob_config ?? [],
      transaction_types: project.transaction_types ?? [],
      lob_form_config: project.lob_form_config ?? null,
    });
    setModalError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) { setModalError('Project name is required'); return; }
    setSaving(true);
    setModalError(null);
    if (editing) {
      const { data, error } = await supabase.from('projects').update(draft).eq('id', editing.id).select('*').single();
      if (error) { setModalError(error.message); setSaving(false); return; }
      logAudit({ action: 'update', entity_type: 'project', entity_id: editing.id, page_module: 'projects', new_value: { name: draft.name } });
      setProjects((prev) => prev.map((p) => (p.id === editing.id ? (data as Project) : p)));
    } else {
      const { data, error } = await supabase.from('projects').insert(draft).select('*').single();
      if (error) { setModalError(error.message); setSaving(false); return; }
      logAudit({ action: 'create', entity_type: 'project', entity_id: data?.id, page_module: 'projects', new_value: { name: draft.name } });
      setProjects((prev) => [...prev, data as Project]);
    }
    setSaving(false);
    setShowModal(false);
  };

  if (loading) return <LoadingState label="Loading projects…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={L('page.projects', 'Projects')}
        subtitle={`${projects.length} projects`}
        actions={
          <button onClick={openNew} className="btn-primary">
            <Plus className="h-4 w-4" /> New Project
          </button>
        }
      />

      {projects.length === 0 ? (
        <EmptyState icon={<FolderKanban className="h-10 w-10" />} title="No projects" subtitle="Create a project to get started" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div key={p.id} className="card p-5">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                    <FolderKanban className="h-5 w-5 text-brand-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-700">{p.name}</div>
                    <div className="text-xs text-slate-400">Created {fmtDate(p.created_at)}</div>
                  </div>
                </div>
                <span className={cls('badge', p.active ? 'badge-pass' : 'badge-fail')}>
                  {p.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {p.description && <p className="mb-3 text-sm text-slate-500">{p.description}</p>}
              <div className="mb-3 flex flex-wrap gap-1">
                {(p.lob_config ?? []).map((l) => (
                  <span key={l} className="badge bg-blue-50 text-blue-700">{l}</span>
                ))}
                {(p.transaction_types ?? []).map((t) => (
                  <span key={t} className="badge bg-brand-50 text-brand-700">{t}</span>
                ))}
              </div>
              <div className="mb-3 text-xs text-slate-400">
                {p.form_config?.categories?.length ?? 0} categories · {p.form_config?.categories?.reduce((s, c) => s + c.items.length, 0) ?? 0} items
              </div>
              <button onClick={() => openEdit(p)} className="btn-secondary w-full text-xs">
                <Edit2 className="h-3.5 w-3.5" /> Edit
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ProjectModal
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          error={modalError}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function ProjectModal({ editing, draft, setDraft, saving, error, onClose, onSave }: {
  editing: Project | null;
  draft: ProjectDraft;
  setDraft: (d: ProjectDraft) => void;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const updateConfig = (config: FormConfig) => setDraft({ ...draft, form_config: config });

  const addCategory = () => {
    const newCat: FormCategory = { key: `Category ${draft.form_config.categories.length + 1}`, label: `New Category`, critical: false, items: [] };
    updateConfig({ ...draft.form_config, categories: [...draft.form_config.categories, newCat] });
  };

  const removeCategory = (idx: number) => {
    updateConfig({ ...draft.form_config, categories: draft.form_config.categories.filter((_, i) => i !== idx) });
  };

  const updateCategory = (idx: number, patch: Partial<FormCategory>) => {
    updateConfig({
      ...draft.form_config,
      categories: draft.form_config.categories.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    });
  };

  const addItem = (catIdx: number) => {
    const cat = draft.form_config.categories[catIdx];
    const newItem: FormItem = { id: `item_${Date.now()}`, label: 'New Item' };
    updateCategory(catIdx, { items: [...cat.items, newItem] });
  };

  const removeItem = (catIdx: number, itemIdx: number) => {
    const cat = draft.form_config.categories[catIdx];
    updateCategory(catIdx, { items: cat.items.filter((_, i) => i !== itemIdx) });
  };

  const updateItem = (catIdx: number, itemIdx: number, patch: Partial<FormItem>) => {
    const cat = draft.form_config.categories[catIdx];
    updateCategory(catIdx, { items: cat.items.map((it, i) => (i === itemIdx ? { ...it, ...patch } : it)) });
  };

  const updateScoring = (patch: Partial<ScoringConfig>) => {
    updateConfig({ ...draft.form_config, scoring: { ...draft.form_config.scoring, ...patch } });
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus('Parsing…');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      const categories: FormCategory[] = [];
      for (const row of rows) {
        const category = String(row['Category'] ?? row['category'] ?? '').trim();
        const label = String(row['Label'] ?? row['label'] ?? row['Item'] ?? '').trim();
        const id = String(row['ID'] ?? row['id'] ?? label.toLowerCase().replace(/\s+/g, '_')).trim();
        const critical = String(row['Critical'] ?? row['critical'] ?? '').trim().toLowerCase() === 'true' || String(row['Critical'] ?? '').trim() === '1';
        if (!category || !label) continue;
        let cat = categories.find((c) => c.key === category);
        if (!cat) {
          cat = { key: category, label: category, critical, items: [] };
          categories.push(cat);
        }
        if (critical) cat.critical = true;
        cat.items.push({ id, label });
      }
      if (categories.length > 0) {
        updateConfig({ ...draft.form_config, categories });
        setUploadStatus(`Imported ${categories.length} categories, ${categories.reduce((s, c) => s + c.items.length, 0)} items.`);
      } else {
        setUploadStatus('No valid rows found. Expected columns: Category, Label, ID, Critical');
      }
    } catch (err) {
      setUploadStatus(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{editing ? 'Edit Project' : 'New Project'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        {error && <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        {/* Basic info */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Project Name *</label>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Description</label>
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Active</label>
            <label className="flex items-center gap-2 pt-1">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="h-4 w-4 rounded" />
              <span className="text-sm text-slate-600">Project is active</span>
            </label>
          </div>
        </div>

        {/* LOB Configuration */}
        <div className="mt-5">
          <div className="mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-700">LOB (Lines of Business)</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {draft.lob_config.map((lob, idx) => (
              <div key={idx} className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-sm text-blue-700">
                {lob}
                <button onClick={() => setDraft({ ...draft, lob_config: draft.lob_config.filter((_, i) => i !== idx) })} className="text-blue-400 hover:text-blue-600">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              id="lob-input"
              type="text"
              placeholder="Add LOB (e.g. Inbound Calls)"
              className="input flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val && !draft.lob_config.includes(val)) {
                    setDraft({ ...draft, lob_config: [...draft.lob_config, val] });
                  }
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            <button
              onClick={() => {
                const input = document.getElementById('lob-input') as HTMLInputElement;
                const val = input.value.trim();
                if (val && !draft.lob_config.includes(val)) {
                  setDraft({ ...draft, lob_config: [...draft.lob_config, val] });
                }
                input.value = '';
              }}
              className="btn-secondary"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {DEFAULT_LOB_OPTIONS.filter((o) => !draft.lob_config.includes(o)).map((o) => (
              <button
                key={o}
                onClick={() => setDraft({ ...draft, lob_config: [...draft.lob_config, o] })}
                className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
              >
                + {o}
              </button>
            ))}
          </div>
        </div>

        {/* Transaction Types Configuration */}
        <div className="mt-5">
          <div className="mb-3 flex items-center gap-2">
            <Tag className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-slate-700">Transaction Types</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {draft.transaction_types.map((tt, idx) => (
              <div key={idx} className="flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-sm text-brand-700">
                {tt}
                <button onClick={() => setDraft({ ...draft, transaction_types: draft.transaction_types.filter((_, i) => i !== idx) })} className="text-brand-400 hover:text-brand-600">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              id="tt-input"
              type="text"
              placeholder="Add transaction type (e.g. Calls)"
              className="input flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val && !draft.transaction_types.includes(val)) {
                    setDraft({ ...draft, transaction_types: [...draft.transaction_types, val] });
                  }
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            <button
              onClick={() => {
                const input = document.getElementById('tt-input') as HTMLInputElement;
                const val = input.value.trim();
                if (val && !draft.transaction_types.includes(val)) {
                  setDraft({ ...draft, transaction_types: [...draft.transaction_types, val] });
                }
                input.value = '';
              }}
              className="btn-secondary"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {DEFAULT_TRANSACTION_OPTIONS.filter((o) => !draft.transaction_types.includes(o)).map((o) => (
              <button
                key={o}
                onClick={() => setDraft({ ...draft, transaction_types: [...draft.transaction_types, o] })}
                className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
              >
                + {o}
              </button>
            ))}
          </div>
        </div>

        {/* Scoring config */}
        <div className="mt-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Scoring Configuration</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="label">Base Pass</label>
              <input type="number" value={draft.form_config.scoring.basePass} onChange={(e) => updateScoring({ basePass: Number(e.target.value) })} className="input" />
            </div>
            <div>
              <label className="label">Base Fail</label>
              <input type="number" value={draft.form_config.scoring.baseFail} onChange={(e) => updateScoring({ baseFail: Number(e.target.value) })} className="input" />
            </div>
            <div>
              <label className="label">Softskill Penalty</label>
              <input type="number" value={draft.form_config.scoring.softskillPenalty} onChange={(e) => updateScoring({ softskillPenalty: Number(e.target.value) })} className="input" />
            </div>
            <div>
              <label className="label">Fail Threshold</label>
              <input type="number" value={draft.form_config.scoring.softskillFailThreshold} onChange={(e) => updateScoring({ softskillFailThreshold: Number(e.target.value) })} className="input" />
            </div>
          </div>
        </div>

        {/* Form config editor */}
        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Form Configuration</h3>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden" />
              <button onClick={() => fileRef.current?.click()} className="btn-secondary text-xs">
                <Upload className="h-3.5 w-3.5" /> Import Excel
              </button>
              <button onClick={addCategory} className="btn-secondary text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Category
              </button>
            </div>
          </div>
          {uploadStatus && <div className="mb-2 text-xs text-slate-500">{uploadStatus}</div>}

          <div className="space-y-3">
            {draft.form_config.categories.map((cat, catIdx) => (
              <div key={catIdx} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={cat.key}
                    onChange={(e) => updateCategory(catIdx, { key: e.target.value })}
                    className="input flex-1 text-xs"
                    placeholder="Category key"
                  />
                  <input
                    value={cat.label}
                    onChange={(e) => updateCategory(catIdx, { label: e.target.value })}
                    className="input flex-1 text-xs"
                    placeholder="Category label"
                  />
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={cat.critical} onChange={(e) => updateCategory(catIdx, { critical: e.target.checked })} className="h-3.5 w-3.5 rounded" />
                    <span className="text-slate-500">Critical</span>
                  </label>
                  <button onClick={() => removeCategory(catIdx)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 pl-2">
                  {cat.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="flex items-center gap-2">
                      <input
                        value={item.id}
                        onChange={(e) => updateItem(catIdx, itemIdx, { id: e.target.value })}
                        className="input w-32 text-xs"
                        placeholder="ID"
                      />
                      <input
                        value={item.label}
                        onChange={(e) => updateItem(catIdx, itemIdx, { label: e.target.value })}
                        className="input flex-1 text-xs"
                        placeholder="Label"
                      />
                      <button onClick={() => removeItem(catIdx, itemIdx)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => addItem(catIdx)} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
                    <Plus className="h-3 w-3" /> Add Item
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Per-LOB Form Config */}
        {draft.lob_config.length > 0 && (
          <div className="mt-5 rounded-lg border border-slate-200 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Per-LOB Evaluation Forms</h3>
            <p className="mb-3 text-xs text-slate-400">Override the default form for specific LOBs. Each LOB can have its own evaluation form.</p>
            <div className="flex flex-wrap gap-2">
              {draft.lob_config.map((lob) => {
                const hasOverride = !!(draft.lob_form_config?.[lob]);
                return (
                  <button
                    key={lob}
                    onClick={() => {
                      const configs = { ...(draft.lob_form_config ?? {}) };
                      if (configs[lob]) {
                        delete configs[lob];
                      } else {
                        configs[lob] = JSON.parse(JSON.stringify(draft.form_config));
                      }
                      setDraft({ ...draft, lob_form_config: Object.keys(configs).length > 0 ? configs : null });
                    }}
                    className={cls(
                      'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                      hasOverride ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    )}
                  >
                    {lob} {hasOverride && '✓'}
                  </button>
                );
              })}
            </div>
            {draft.lob_form_config && Object.keys(draft.lob_form_config).length > 0 && (
              <div className="mt-3 space-y-2">
                {Object.entries(draft.lob_form_config).map(([lob, config]) => (
                  <div key={lob} className="rounded-lg bg-slate-50 p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">{lob}</span>
                      <span className="text-xs text-slate-400">{config.categories.length} categories · {config.categories.reduce((s, c) => s + c.items.length, 0)} items</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {config.categories.map((c) => (
                        <span key={c.key} className={cls('rounded px-1.5 py-0.5 text-[10px]', c.critical ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700')}>
                          {c.label}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        const configs = { ...draft.lob_form_config! };
                        configs[lob] = JSON.parse(JSON.stringify(draft.form_config));
                        setDraft({ ...draft, lob_form_config: configs });
                      }}
                      className="mt-2 text-xs text-brand-600 hover:underline"
                    >
                      Copy default form
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={onSave} disabled={saving} className="btn-primary">
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

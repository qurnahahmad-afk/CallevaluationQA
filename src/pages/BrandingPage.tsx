import { useMemo, useState } from 'react';
import {
  Palette, Search, Save, RotateCcw, Check, X, AlertCircle, Filter,
  Type, Navigation, FileText, LayoutDashboard, BarChart3, Bell,
  Tag, Columns, Settings, Users as UsersIcon, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useLabels, type SystemLabel } from '../lib/labels';
import { useAuth } from '../lib/auth';
import { cls } from '../lib/utils';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui';

const CATEGORIES = [
  { key: 'system', label: 'System', icon: Settings, desc: 'System name and subtitle' },
  { key: 'navigation', label: 'Navigation / Menus', icon: Navigation, desc: 'Sidebar menu items' },
  { key: 'pages', label: 'Page Titles', icon: FileText, desc: 'Page header titles' },
  { key: 'buttons', label: 'Buttons', icon: Tag, desc: 'Button labels' },
  { key: 'columns', label: 'Column Headers', icon: Columns, desc: 'Table column headers' },
  { key: 'fields', label: 'Field Labels', icon: Type, desc: 'Form field labels' },
  { key: 'forms', label: 'Section / Form Titles', icon: FileText, desc: 'Form section titles' },
  { key: 'dashboards', label: 'Dashboard Titles', icon: LayoutDashboard, desc: 'Dashboard stat cards and sections' },
  { key: 'reports', label: 'Report Names', icon: BarChart3, desc: 'Report titles' },
  { key: 'notifications', label: 'Notification Titles', icon: Bell, desc: 'Notification titles' },
  { key: 'roles', label: 'Role Names', icon: UsersIcon, desc: 'Role display names' },
] as const;

export function BrandingPage() {
  const { profile } = useAuth();
  const { raw, loading, error, updateLabel, refresh } = useLabels();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['system']));

  const isAdmin = profile?.role === 'admin';

  const filtered = useMemo(() => {
    let list = raw;
    if (activeCategory !== 'all') list = list.filter((l) => l.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((l) => l.key.toLowerCase().includes(q) || l.label.toLowerCase().includes(q) || (l.description ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [raw, activeCategory, search]);

  const grouped = useMemo(() => {
    const map: Record<string, SystemLabel[]> = {};
    for (const l of filtered) {
      if (!map[l.category]) map[l.category] = [];
      map[l.category].push(l);
    }
    return map;
  }, [filtered]);

  const startEdit = (label: SystemLabel) => {
    setEditingId(label.id);
    setEditValue(label.label);
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
    setSaveError(null);
  };

  const saveEdit = async (label: SystemLabel) => {
    if (!editValue.trim()) { setSaveError('Label cannot be empty'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      await updateLabel(label.id, editValue.trim());
      setSavedFlash(label.key);
      setTimeout(() => setSavedFlash(null), 2000);
      setEditingId(null);
      setEditValue('');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  if (loading) return <LoadingState label="Loading system labels…" />;
  if (error) return <ErrorState message={error} />;

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="System Branding" subtitle="View-only access" />
        <EmptyState
          icon={<AlertCircle className="h-10 w-10" />}
          title="Access restricted"
          subtitle="Only the Administrator can modify system labels. You can see the updated names throughout the system."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Branding & Label Management"
        subtitle={`${raw.length} labels · saved changes apply across the entire system`}
      />

      {/* Info banner */}
      <div className="card flex items-start gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
          <Palette className="h-5 w-5 text-brand-600" />
        </div>
        <div className="text-sm text-slate-600">
          <p className="font-medium text-slate-700">How this works</p>
          <p className="mt-1 text-xs text-slate-500">
            Edit any label below and click save. The change is stored in the database and instantly reflected across all pages, menus, dashboards, reports, and exports.
            Use the search bar to find a specific label, or filter by category. You can expand each category to see all labels in it.
          </p>
        </div>
      </div>

      {/* Search + filter */}
      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label">Search Labels</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by key, label, or description…"
              className="input pl-9"
            />
          </div>
        </div>
        <div>
          <label className="label">Category</label>
          <select value={activeCategory} onChange={(e) => setActiveCategory(e.target.value)} className="input">
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
      </div>

      {saveError && (
        <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {saveError}</div>
        </div>
      )}

      {/* Category cards */}
      {activeCategory === 'all' && !search.trim() ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const count = raw.filter((l) => l.category === cat.key).length;
            return (
              <button
                key={cat.key}
                onClick={() => { setActiveCategory(cat.key); setExpandedCats(new Set([cat.key])); }}
                className="card p-5 text-left transition hover:shadow-cardHover"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                    <Icon className="h-5 w-5 text-brand-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-700">{cat.label}</div>
                    <div className="text-xs text-slate-400">{cat.desc}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-400">{count} label{count !== 1 ? 's' : ''}</div>
              </button>
            );
          })}
        </div>
      ) : (
        /* Label list grouped by category */
        <div className="space-y-3">
          {Object.entries(grouped).length === 0 ? (
            <EmptyState icon={<Search className="h-10 w-10" />} title="No labels found" subtitle="Try a different search or category" />
          ) : (
            Object.entries(grouped).map(([cat, labels]) => {
              const catMeta = CATEGORIES.find((c) => c.key === cat);
              const Icon = catMeta?.icon ?? Tag;
              const expanded = expandedCats.has(cat) || activeCategory !== 'all' || !!search.trim();
              return (
                <div key={cat} className="card overflow-hidden">
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="flex w-full items-center justify-between p-4 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-brand-600" />
                      <span className="text-sm font-semibold text-slate-700">{catMeta?.label ?? cat}</span>
                      <span className="text-xs text-slate-400">({labels.length})</span>
                    </div>
                    {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                  </button>
                  {expanded && (
                    <div className="divide-y divide-slate-100">
                      {labels.map((label) => {
                        const isEditing = editingId === label.id;
                        const isSaved = savedFlash === label.key;
                        return (
                          <div key={label.id} className="flex items-center gap-3 p-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <code className="text-xs text-slate-400">{label.key}</code>
                                {isSaved && (
                                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                                    <Check className="h-3 w-3" /> Saved
                                  </span>
                                )}
                              </div>
                              {label.description && (
                                <div className="mt-0.5 text-xs text-slate-500">{label.description}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {isEditing ? (
                                <>
                                  <input
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveEdit(label);
                                      if (e.key === 'Escape') cancelEdit();
                                    }}
                                    autoFocus
                                    className="input w-64 text-sm"
                                    placeholder="Enter new label…"
                                  />
                                  <button
                                    onClick={() => saveEdit(label)}
                                    disabled={saving}
                                    className="btn-primary text-xs"
                                  >
                                    <Save className="h-3.5 w-3.5" /> Save
                                  </button>
                                  <button onClick={cancelEdit} className="btn-secondary text-xs">
                                    <X className="h-3.5 w-3.5" /> Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-sm font-medium text-slate-700">{label.label}</span>
                                  {isAdmin && (
                                    <button
                                      onClick={() => startEdit(label)}
                                      className="btn-ghost text-xs"
                                    >
                                      <Tag className="h-3.5 w-3.5" /> Edit
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

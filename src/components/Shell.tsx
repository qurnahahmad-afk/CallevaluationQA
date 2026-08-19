import { useEffect, useState, type ReactNode } from 'react';
import {
  LayoutDashboard, FilePlus2, ClipboardList, Users, BookOpen, Headphones,
  GraduationCap, GitCompare, BarChart3, PieChart, UserCog, FolderKanban,
  TrendingUp, ClipboardCheck, Bell, ScrollText, Palette, ChevronRight,
  LogOut, Settings, KeyRound, X, ShieldCheck, AlertTriangle, Trash2,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { navigate, useRoute, type Route } from '../lib/router';
import { useAuth } from '../lib/auth';
import { useL } from '../lib/labels';
import { cls } from '../lib/utils';
import { supabase } from '../lib/supabase';

type NavItem = { route: Route; labelKey: string; defaultLabel: string; icon: typeof LayoutDashboard; roles?: string[]; permission?: import('../types').PermissionKey };
type NavSection = { title?: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { route: { name: 'dashboard' }, labelKey: 'nav.dashboard', defaultLabel: 'Dashboard', icon: LayoutDashboard, permission: 'view_dashboard' },
    ],
  },
  {
    title: 'Quality',
    items: [
      { route: { name: 'new' }, labelKey: 'nav.new_evaluation', defaultLabel: 'New Evaluation', icon: FilePlus2, permission: 'create_evaluation' },
      { route: { name: 'evaluations' }, labelKey: 'nav.evaluations', defaultLabel: 'Evaluations', icon: ClipboardList, permission: 'view_evaluations' },
      { route: { name: 'calibration' }, labelKey: 'nav.calibration', defaultLabel: 'Calibration', icon: GitCompare, permission: 'manage_calibration' },
      { route: { name: 'analysis' }, labelKey: 'nav.analysis', defaultLabel: 'Analysis', icon: PieChart, permission: 'view_analysis' },
      { route: { name: 'repeated-failure' }, labelKey: 'nav.repeated_failure', defaultLabel: 'Repeated Failure', icon: AlertTriangle, permission: 'view_evaluations' },
    ],
  },
  {
    title: 'Coaching',
    items: [
      { route: { name: 'coaching' }, labelKey: 'nav.coaching', defaultLabel: 'Coaching', icon: GraduationCap, permission: 'manage_coaching' },
      { route: { name: 'coaching-dashboard' }, labelKey: 'nav.coaching_dashboard', defaultLabel: 'Coaching Dashboard', icon: ClipboardCheck, permission: 'view_coaching_dashboard' },
      { route: { name: 'agent-performance' }, labelKey: 'nav.agent_performance', defaultLabel: 'Agent Performance', icon: TrendingUp, permission: 'view_agent_performance' },
    ],
  },
  {
    title: 'Reports & Admin',
    items: [
      { route: { name: 'reports' }, labelKey: 'nav.reports', defaultLabel: 'Reports', icon: BarChart3, permission: 'view_reports' },
      { route: { name: 'agents' }, labelKey: 'nav.agents', defaultLabel: 'Agents', icon: Users, permission: 'view_agents_page' },
      { route: { name: 'projects' }, labelKey: 'nav.projects', defaultLabel: 'Projects', icon: FolderKanban, permission: 'manage_projects' },
      { route: { name: 'users' }, labelKey: 'nav.users', defaultLabel: 'User Management', icon: UserCog, permission: 'manage_users' },
      { route: { name: 'audit' }, labelKey: 'nav.audit', defaultLabel: 'Audit History', icon: ScrollText, permission: 'view_audit_history' },
      { route: { name: 'guide-book' }, labelKey: 'nav.guide_book', defaultLabel: 'Guide Book', icon: BookOpen, permission: 'view_glossary' },
      { route: { name: 'branding' }, labelKey: 'nav.branding', defaultLabel: 'System Branding', icon: Palette, permission: 'manage_users' },
      { route: { name: 'system-admin' }, labelKey: 'nav.system_admin', defaultLabel: 'System Administration', icon: ShieldCheck, permission: 'manage_system_admin' },
      { route: { name: 'data-clearance' }, labelKey: 'nav.data_clearance', defaultLabel: 'Data Clearance', icon: Trash2, permission: 'data_clearance' },
    ],
  },
];

const AGENT_NAV: NavItem[] = [
  { route: { name: 'agent-portal' }, labelKey: 'nav.agent_portal', defaultLabel: 'My Portal', icon: Bell },
  { route: { name: 'guide-book' }, labelKey: 'nav.guide_book', defaultLabel: 'Guide Book', icon: BookOpen, permission: 'view_glossary' },
];

function routeKey(r: Route): string { return r.name === 'evaluation' ? 'evaluations' : r.name; }
function isActive(current: Route, item: NavItem): boolean { return routeKey(current) === routeKey(item.route); }

function getBreadcrumb(route: Route, L: (k: string, f?: string) => string): { label: string; route?: Route }[] {
  const crumbs: { label: string; route?: Route }[] = [{ label: L('nav.dashboard', 'Dashboard'), route: { name: 'dashboard' } }];
  const map: Record<string, { labelKey: string; default: string }> = {
    dashboard: { labelKey: 'nav.dashboard', default: 'Dashboard' },
    new: { labelKey: 'nav.new_evaluation', default: 'New Evaluation' },
    evaluations: { labelKey: 'nav.evaluations', default: 'Evaluations' },
    evaluation: { labelKey: 'page.evaluation_detail', default: 'Evaluation Detail' },
    coaching: { labelKey: 'nav.coaching', default: 'Coaching' },
    'coaching-dashboard': { labelKey: 'nav.coaching_dashboard', default: 'Coaching Dashboard' },
    calibration: { labelKey: 'nav.calibration', default: 'Calibration' },
    analysis: { labelKey: 'nav.analysis', default: 'Analysis' },
    reports: { labelKey: 'nav.reports', default: 'Reports' },
    'agent-performance': { labelKey: 'nav.agent_performance', default: 'Agent Performance' },
    agents: { labelKey: 'nav.agents', default: 'Agents' },
    projects: { labelKey: 'nav.projects', default: 'Projects' },
    users: { labelKey: 'nav.users', default: 'User Management' },
    audit: { labelKey: 'nav.audit', default: 'Audit History' },
    glossary: { labelKey: 'nav.guide_book', default: 'Guide Book' },
    'guide-book': { labelKey: 'nav.guide_book', default: 'Guide Book' },
    'system-admin': { labelKey: 'nav.system_admin', default: 'System Administration' },
    'data-clearance': { labelKey: 'nav.data_clearance', default: 'Data Clearance' },
    branding: { labelKey: 'nav.branding', default: 'System Branding' },
    'agent-portal': { labelKey: 'nav.agent_portal', default: 'My Portal' },
  };
  const m = map[route.name];
  if (m && route.name !== 'dashboard') {
    crumbs.push({ label: L(m.labelKey, m.default) });
  }
  return crumbs;
}

export function Shell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const { profile, projects, activeProjectId, setActiveProjectId, hasPermission } = useAuth();
  const L = useL();
  const [showChangePwd, setShowChangePwd] = useState(false);
  const isAgent = profile?.role === 'agent';
  const systemName = L('system_name', 'Malomatia QA');
  const systemSubtitle = L('system_subtitle', 'Call Evaluation System');
  const breadcrumbs = getBreadcrumb(route, L);

  useEffect(() => {
    document.title = `${systemName} · ${systemSubtitle}`;
  }, [systemName, systemSubtitle]);

  const visibleSections = isAgent ? [{ items: AGENT_NAV.filter((item) => !item.permission || hasPermission(item.permission)) }] : NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((item) => {
      if (item.roles && (!profile || !item.roles.includes(profile.role))) return false;
      if (item.permission && !hasPermission(item.permission)) return false;
      return true;
    }),
  })).filter((s) => s.items.length > 0);

  const allVisibleItems = visibleSections.flatMap((s) => s.items);
  const roleLabel = L(`role.${profile?.role ?? 'admin'}`, profile?.role ?? '');

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.hash = '#/dashboard';
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white shadow-sidebar lg:flex">
        {/* Logo */}
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <Headphones className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-slate-900">{systemName}</div>
            <div className="text-xs text-slate-500">{systemSubtitle}</div>
          </div>
        </div>

        {/* Project selector */}
        {!isAgent && projects.length > 0 && (
          <div className="border-b border-slate-200 px-3 py-3">
            <label className="label-xs uppercase tracking-wide text-slate-400">Project</label>
            {projects.length === 1 ? (
              <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
                <FolderKanban className="h-4 w-4 text-brand-600" />
                <span className="truncate">{projects[0].name}</span>
              </div>
            ) : (
              <div className="space-y-1">
                {projects.map((p) => {
                  const isActiveProj = (activeProjectId ?? '') === p.id;
                  return (
                    <button key={p.id} onClick={() => setActiveProjectId(isActiveProj ? null : p.id)}
                      className={cls('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                        isActiveProj ? 'bg-brand-50 text-brand-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
                      <FolderKanban className={cls('h-4 w-4 shrink-0', isActiveProj ? 'text-brand-600' : 'text-slate-400')} />
                      <span className="truncate">{p.name}</span>
                      {isActiveProj && <ChevronRight className="ml-auto h-3.5 w-3.5 text-brand-400" />}
                    </button>
                  );
                })}
                <button onClick={() => setActiveProjectId(null)}
                  className={cls('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                    !activeProjectId ? 'bg-brand-50 text-brand-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
                  <Settings className={cls('h-4 w-4 shrink-0', !activeProjectId ? 'text-brand-600' : 'text-slate-400')} />
                  <span className="truncate">All Projects</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {visibleSections.map((section, si) => (
            <div key={si}>
              {section.title && (
                <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{section.title}</div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(route, item);
                  const label = L(item.labelKey, item.defaultLabel);
                  return (
                    <button key={item.labelKey} onClick={() => navigate(item.route)}
                      className={cls('group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                        active ? 'bg-brand-50 text-brand-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
                      <Icon className={cls('h-4 w-4 shrink-0 transition-colors', active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')} />
                      <span className="truncate">{label}</span>
                      {active && <ChevronRight className="ml-auto h-3.5 w-3.5 text-brand-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User profile */}
        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white shadow-sm">
              {profile?.full_name?.charAt(0) ?? '?'}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium text-slate-700">{profile?.full_name ?? 'Admin'}</div>
              <div className="truncate text-xs text-slate-400">{roleLabel}</div>
            </div>
            <button onClick={handleSignOut} title="Sign out" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-danger-50 hover:text-danger-600">
              <LogOut className="h-4 w-4" />
            </button>
            <button onClick={() => setShowChangePwd(true)} title="Change password" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600">
              <KeyRound className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <Headphones className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold">{systemName}</span>
        </div>
        {!isAgent && (
          <select value={activeProjectId ?? ''} onChange={(e) => setActiveProjectId(e.target.value || null)} className="input w-auto text-xs">
            <option value="">All Projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white shadow-lg lg:hidden">
        {allVisibleItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = isActive(route, item);
          const label = L(item.labelKey, item.defaultLabel);
          return (
            <button key={item.labelKey} onClick={() => navigate(item.route)}
              className={cls('flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors', active ? 'text-brand-600' : 'text-slate-400 hover:text-slate-600')}>
              <Icon className="h-5 w-5" />
              <span className="truncate max-w-[64px]">{label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>

      {/* Main content */}
      <main className="lg:pl-64">
        {/* Desktop breadcrumb bar */}
        <div className="hidden border-b border-slate-200 bg-white/80 px-8 py-2.5 backdrop-blur-sm lg:block">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="breadcrumb">
              {breadcrumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                  <span className={cls(i === breadcrumbs.length - 1 ? 'font-medium text-slate-600' : 'text-slate-400')}>{c.label}</span>
                </span>
              ))}
            </div>
            {!isAgent && projects.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Settings className="h-3.5 w-3.5" />
                <span>{projects.find((p) => p.id === (activeProjectId ?? ''))?.name ?? 'All Projects'}</span>
              </div>
            )}
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-12 animate-fadeIn">
          {children}
        </div>
      </main>

      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = async () => {
    setError(null);
    if (!oldPassword.trim()) { setError('Current password is required'); return; }
    if (!newPassword.trim()) { setError('New password is required'); return; }
    if (newPassword !== confirmPassword) { setError('New passwords do not match'); return; }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    setSaving(true);
    try {
      const userEmail = (await supabase.auth.getUser()).data.user?.email ?? '';
      if (!userEmail) { setError('Unable to identify current user.'); setSaving(false); return; }
      // Verify the current password using a throwaway client so the active session is not disrupted.
      const tempClient = createClient(
        import.meta.env.VITE_SUPABASE_URL as string,
        import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        { auth: { persistSession: false } },
      );
      const { error: verifyError } = await tempClient.auth.signInWithPassword({
        email: userEmail,
        password: oldPassword,
      });
      if (verifyError) { setError('Current password is incorrect'); setSaving(false); return; }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) { setError(updateError.message); setSaving(false); return; }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Change Password</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        {success ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">Password changed successfully.</div>
            <div className="flex justify-end"><button onClick={onClose} className="btn-primary">Done</button></div>
          </div>
        ) : (
          <>
            {error && <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
            <div className="space-y-3">
              <div>
                <label className="label">Current Password</label>
                <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="btn-secondary">Cancel</button>
              <button onClick={handleChange} disabled={saving} className="btn-primary">
                {saving ? 'Changing…' : 'Change Password'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

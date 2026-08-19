import { useEffect, useMemo, useState, useRef } from 'react';
import {
  UserCog, Plus, X, Save, Edit2, KeyRound, Trash2, FolderKanban, CheckSquare, Square,
  Shield, Mail, Send, Copy, Check, Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import { useAuth } from '../lib/auth';
import { cls, fmtDate, downloadCSV } from '../lib/utils';
import { useProfiles, useProjects, useUserProjects } from '../lib/hooks';
import { navigate } from '../lib/router';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui';
import { useL } from '../lib/labels';
import type { Profile, Role, Project, UserProject, PermissionKey, RolePermissions, Invitation } from '../types';

const ROLES: Role[] = ['admin', 'manager', 'quality', 'quality_expert', 'operation', 'supervisor', 'agent'];

const PERMISSION_KEYS: { key: PermissionKey; label: string }[] = [
  { key: 'view_dashboard', label: 'View Dashboard' },
  { key: 'create_evaluation', label: 'Create Evaluation' },
  { key: 'view_evaluations', label: 'View Evaluations' },
  { key: 'manage_agents', label: 'Manage Agents' },
  { key: 'manage_projects', label: 'Manage Projects' },
  { key: 'manage_users', label: 'Manage Users' },
  { key: 'view_reports', label: 'View Reports' },
  { key: 'view_analysis', label: 'View Analysis' },
  { key: 'manage_coaching', label: 'Manage Coaching' },
  { key: 'manage_calibration', label: 'Manage Calibration' },
  { key: 'view_glossary', label: 'View Guide Book' },
  { key: 'view_agent_performance', label: 'View Agent Performance' },
  { key: 'send_invitations', label: 'Send Invitations' },
  { key: 'reset_passwords', label: 'Reset Passwords' },
  { key: 'view_audit_history', label: 'View Audit History' },
  { key: 'view_coaching_dashboard', label: 'View Coaching Dashboard' },
  { key: 'export_data', label: 'Export Data' },
  { key: 'view_own_evaluations', label: 'View Own Evaluations' },
  { key: 'view_own_coaching', label: 'View Own Coaching' },
  { key: 'add_coaching_feedback', label: 'Add Coaching Feedback' },
  { key: 'modify_evaluation', label: 'Modify Evaluation' },
  { key: 'modify_score', label: 'Modify Score' },
  { key: 'data_clearance', label: 'Data Clearance' },
  { key: 'view_agents_page', label: 'View Agents Page' },
  { key: 'create_calibration', label: 'Create Calibration Sessions' },
  { key: 'manage_calibration_sessions', label: 'Manage Calibration Sessions' },
  { key: 'review_expert_evaluations', label: 'Review Expert Evaluations' },
  { key: 'compare_coach_expert', label: 'Compare Coach vs Expert' },
  { key: 'finalize_calibration', label: 'Finalize Calibration Results' },
  { key: 'manage_system_admin', label: 'Manage System Administration' },
];

export function UsersPage() {
  const { profile: currentUser } = useAuth();
  const L = useL();
  const { profiles, loading, error, setProfiles } = useProfiles();
  const { projects } = useProjects();
  const { userProjects, setUserProjects } = useUserProjects();

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [accessUser, setAccessUser] = useState<Profile | null>(null);
  const [resetUser, setResetUser] = useState<Profile | null>(null);
  const [deleteUser, setDeleteUser] = useState<Profile | null>(null);
  const [showPermissions, setShowPermissions] = useState(false);
  const [showInvitations, setShowInvitations] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [tab, setTab] = useState<'users' | 'permissions' | 'invitations'>('users');

  if (loading) return <LoadingState label="Loading users…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={L('page.users', 'User Management')}
        subtitle={`${profiles.length} users`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => downloadTemplate()} className="btn-ghost text-sm" title="Download Excel template">
              <FileSpreadsheet className="h-4 w-4" /> Template
            </button>
            <button onClick={() => setShowUpload(true)} className="btn-secondary">
              <Upload className="h-4 w-4" /> Upload Users
            </button>
            <button onClick={() => setShowInvitations(true)} className="btn-secondary">
              <Mail className="h-4 w-4" /> Invitations
            </button>
            <button onClick={() => navigate({ name: 'data-clearance' })} className="btn-secondary">
              <Trash2 className="h-4 w-4" /> Data Clearance
            </button>
            <button onClick={() => setTab('permissions')} className="btn-secondary">
              <Shield className="h-4 w-4" /> Permissions
            </button>
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus className="h-4 w-4" /> Add User
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(['users', 'permissions', 'invitations'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cls('px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors',
              tab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700')}
          >
            {t === 'users' ? 'Users' : t === 'permissions' ? 'Role Permissions' : 'Invitations'}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <>
          {profiles.length === 0 ? (
            <EmptyState icon={<UserCog className="h-10 w-10" />} title="No users" />
          ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Active</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="table-row">
                    <td className="px-4 py-3 font-medium text-slate-700">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                          {p.full_name?.charAt(0) ?? '?'}
                        </div>
                        {p.full_name}
                        {p.id === currentUser?.id && <span className="badge-neutral text-[10px]">You</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.email}</td>
                    <td className="px-4 py-3">
                      <span className={cls('badge capitalize',
                        p.role === 'admin' ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'badge-neutral')}>
                        {p.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cls('badge', p.active ? 'badge-pass' : 'badge-fail')}>
                        {p.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(p.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditing(p)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title="Edit">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => setAccessUser(p)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600" title="Project Access">
                          <FolderKanban className="h-4 w-4" />
                        </button>
                        <button onClick={() => setResetUser(p)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-600" title="Reset Password">
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteUser(p)}
                          className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                          disabled={p.id === currentUser?.id}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
          )}
        </>
      )}

      {tab === 'permissions' && (
        <RolePermissionsPanel />
      )}

      {tab === 'invitations' && (
        <InvitationsPanel />
      )}

      {showCreate && (
        <CreateUserModal
          projects={projects}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); window.location.reload(); }}
        />
      )}

      {editing && (
        <EditUserModal
          profile={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setEditing(null);
          }}
        />
      )}

      {accessUser && (
        <ProjectAccessModal
          profile={accessUser}
          projects={projects}
          userProjects={userProjects}
          onClose={() => setAccessUser(null)}
          onUpdated={(ups) => {
            setUserProjects(ups);
          }}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          profile={resetUser}
          onClose={() => setResetUser(null)}
        />
      )}

      {deleteUser && (
        <DeleteUserModal
          profile={deleteUser}
          onClose={() => setDeleteUser(null)}
          onDeleted={() => {
            setProfiles((prev) => prev.filter((p) => p.id !== deleteUser.id));
            setUserProjects((prev) => prev.filter((up) => up.user_id !== deleteUser.id));
            setDeleteUser(null);
          }}
        />
      )}
      {showUpload && (
        <UploadUsersModal
          projects={projects}
          onClose={() => setShowUpload(false)}
          onUploaded={() => { setShowUpload(false); window.location.reload(); }}
        />
      )}
      {showInvitations && (
        <CreateInvitationModal
          projects={projects}
          onClose={() => setShowInvitations(false)}
          onCreated={() => setShowInvitations(false)}
        />
      )}
    </div>
  );
}

function RolePermissionsPanel() {
  const [rolePerms, setRolePerms] = useState<RolePermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>('admin');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('role_permissions').select('*');
      if (error) setError(error.message);
      else setRolePerms(data as RolePermissions[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingState label="Loading permissions…" />;
  if (error) return <ErrorState message={error} />;

  const current = rolePerms.find((rp) => rp.role === selectedRole);
  const perms = (current?.permissions ?? {}) as Record<PermissionKey, boolean>;

  const togglePerm = (key: PermissionKey) => {
    setRolePerms((prev) => prev.map((rp) =>
      rp.role === selectedRole
        ? { ...rp, permissions: { ...rp.permissions, [key]: !rp.permissions[key] } }
        : rp
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    const updated = rolePerms.find((rp) => rp.role === selectedRole);
    if (!updated) return;
    const { error } = await supabase.from('role_permissions').update({ permissions: updated.permissions, updated_at: new Date().toISOString() }).eq('role', selectedRole);
    if (error) setError(error.message);
    else logAudit({ action: 'update_permissions', entity_type: 'role_permissions', entity_id: selectedRole, page_module: 'users', new_value: updated.permissions as Record<string, unknown> });
    setSaving(false);
  };

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Customize Role Permissions</h3>
        <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
          <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {ROLES.map((r) => (
          <button
            key={r}
            onClick={() => setSelectedRole(r)}
            className={cls('rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors',
              selectedRole === r ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {PERMISSION_KEYS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => togglePerm(key)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 text-sm hover:bg-slate-50"
          >
            {perms[key] ? <CheckSquare className="h-4 w-4 text-brand-600" /> : <Square className="h-4 w-4 text-slate-300" />}
            <span className={cls('text-slate-600', !perms[key] && 'text-slate-400')}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function InvitationsPanel() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('invitations').select('*').order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setInvitations((data ?? []) as Invitation[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const copyLink = (token: string, id: string) => {
    const link = `${window.location.origin}/#/accept-invite?token=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const revoke = async (id: string) => {
    await supabase.from('invitations').delete().eq('id', id);
    logAudit({ action: 'revoke_invitation', entity_type: 'invitation', entity_id: id, page_module: 'users' });
    load();
  };

  if (loading) return <LoadingState label="Loading invitations…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="card overflow-hidden">
      {invitations.length === 0 ? (
        <EmptyState icon={<Mail className="h-10 w-10" />} title="No invitations" subtitle="Send invitation links to onboard new users" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Expires</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id} className="table-row">
                  <td className="px-4 py-3 font-medium text-slate-700">{inv.email}</td>
                  <td className="px-4 py-3"><span className="badge-neutral capitalize">{inv.role}</span></td>
                  <td className="px-4 py-3">
                    <span className={cls('badge', inv.status === 'pending' ? 'badge-pass' : inv.status === 'accepted' ? 'badge-neutral' : 'badge-fail')}>{inv.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(inv.created_at)}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(inv.expires_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => copyLink(inv.token, inv.id)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title="Copy link">
                        {copiedId === inv.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </button>
                      <button onClick={() => revoke(inv.id)} className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Revoke">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateInvitationModal({ projects, onClose, onCreated }: {
  projects: Project[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [projectId, setProjectId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!email.trim()) { setError('Email is required'); return; }
    if (!email.trim().match(/^[a-z]+\.[a-z]+@crystel\.co$/i)) { setError('Email must be in format: firstname.secondname@Crystel.co'); return; }
    setSaving(true);
    setError(null);
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('invitations').insert({
      email: email.trim(),
      role,
      project_id: projectId || null,
      invited_by: userData.user?.id ?? null,
    }).select('*').single();
    if (error) { setError(error.message); setSaving(false); return; }
    logAudit({ action: 'create_invitation', entity_type: 'invitation', entity_id: data?.id, page_module: 'users', new_value: { email: email.trim(), role } });
    const link = `${window.location.origin}/#/accept-invite?token=${(data as Invitation).token}`;
    setCreatedLink(link);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Send Invitation</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        {createdLink ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Invitation created successfully!</div>
            <div>
              <label className="label">Invitation Link</label>
              <div className="flex gap-2">
                <input value={createdLink} readOnly className="input flex-1 bg-slate-50" />
                <button onClick={() => navigator.clipboard.writeText(createdLink)} className="btn-secondary"><Copy className="h-4 w-4" /></button>
              </div>
            </div>
            <p className="text-xs text-slate-500">Share this link with the user. They will be prompted to set their password on first login. The link expires in 7 days.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="label">Email *</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="firstname.secondname@Crystel.co" className="input" />
              <p className="mt-1 text-xs text-slate-400">Format: firstname.secondname@Crystel.co</p>
            </div>
            <div>
              <label className="label">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input">
                {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Project (optional)</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
                <option value="">No specific project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          {createdLink ? (
            <button onClick={onCreated} className="btn-primary">Done</button>
          ) : (
            <>
              <button onClick={onClose} className="btn-secondary">Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="btn-primary">
                <Send className="h-4 w-4" /> {saving ? 'Sending…' : 'Send Invitation'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function callManageUser(body: Record<string, unknown>) {
  return supabase.functions.invoke('manage-user', { body });
}

const USER_TEMPLATE_HEADERS = ['Full Name', 'Email', 'Project Access', 'Password', 'Role'];

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    USER_TEMPLATE_HEADERS,
    ['John Doe', 'john.doe@crystel.co', 'Project A, Project B', 'QA123#00', 'quality'],
  ]);
  ws['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Users');
  XLSX.writeFile(wb, 'users_template.xlsx');
}

function CreateUserModal({ projects, onClose, onCreated }: {
  projects: Project[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [projectIds, setProjectIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleProject = (id: string) => {
    setProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!email.trim() || !password.trim()) { setError('Email and password are required'); return; }
    setSaving(true);
    setError(null);
    const { data, error } = await callManageUser({
      action: 'create',
      email: email.trim(),
      password,
      full_name: fullName.trim(),
      role,
      project_ids: Array.from(projectIds),
    });
    if (error) { setError(error.message); setSaving(false); return; }
    if (data?.error) { setError(String(data.error)); setSaving(false); return; }
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Add User</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="label">Full Name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Password *</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input">
              {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Project Access</label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {projects.length === 0 ? <p className="text-xs text-slate-400">No projects available.</p> : projects.map((p) => (
                <button key={p.id} onClick={() => toggleProject(p.id)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                  {projectIds.has(p.id) ? <CheckSquare className="h-3.5 w-3.5 text-brand-600" /> : <Square className="h-3.5 w-3.5 text-slate-300" />}
                  <span className="text-slate-600">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="btn-primary">
            <Save className="h-4 w-4" /> {saving ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditUserModal({ profile, onClose, onSaved }: {
  profile: Profile;
  onClose: () => void;
  onSaved: (p: Profile) => void;
}) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [role, setRole] = useState<Role>(profile.role);
  const [active, setActive] = useState(profile.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, role, active })
      .eq('id', profile.id)
      .select('*')
      .single();
    if (error) { setError(error.message); setSaving(false); return; }
    logAudit({ action: 'update_user', entity_type: 'profile', entity_id: profile.id, page_module: 'users', old_value: { full_name: profile.full_name, role: profile.role, active: profile.active }, new_value: { full_name: fullName, role, active } });
    onSaved(data as Profile);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Edit User</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="label">Full Name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Email</label>
            <input value={profile.email} disabled className="input bg-slate-50 text-slate-400" />
          </div>
          <div>
            <label className="label">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input">
              {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded" />
            <span className="text-slate-600">Active</span>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectAccessModal({ profile, projects, userProjects, onClose, onUpdated }: {
  profile: Profile;
  projects: Project[];
  userProjects: UserProject[];
  onClose: () => void;
  onUpdated: (ups: UserProject[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(
    userProjects.filter((up) => up.user_id === profile.id).map((up) => up.project_id)
  ));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    // Delete existing
    await supabase.from('user_projects').delete().eq('user_id', profile.id);
    // Insert new
    const inserts = Array.from(selected).map((pid) => ({ user_id: profile.id, project_id: pid }));
    if (inserts.length > 0) {
      const { error: insertError } = await supabase.from('user_projects').insert(inserts);
      if (insertError) { setError(insertError.message); setSaving(false); return; }
    }
    // Update local state
    const removed = userProjects.filter((up) => up.user_id !== profile.id);
    const newUps: UserProject[] = inserts.map((ins, i) => ({
      id: `${ins.user_id}-${ins.project_id}-${i}`,
      user_id: ins.user_id,
      project_id: ins.project_id,
      created_at: new Date().toISOString(),
    }));
    onUpdated([...removed, ...newUps]);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Project Access — {profile.full_name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {projects.length === 0 ? <p className="text-sm text-slate-400">No projects available.</p> : projects.map((p) => (
            <button key={p.id} onClick={() => toggle(p.id)} className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-sm hover:bg-slate-50">
              {selected.has(p.id) ? <CheckSquare className="h-4 w-4 text-brand-600" /> : <Square className="h-4 w-4 text-slate-300" />}
              <span className="text-slate-600">{p.name}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ profile, onClose }: {
  profile: Profile;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('QA123#00');
  const [confirmPassword, setConfirmPassword] = useState('QA123#00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleReset = async () => {
    if (!password.trim()) { setError('Password is required'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setSaving(true);
    setError(null);
    const { data, error } = await callManageUser({ action: 'reset_password', user_id: profile.id, password });
    if (error) { setError(error.message); setSaving(false); return; }
    if (data?.error) { setError(String(data.error)); setSaving(false); return; }
    setSuccess(true);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Reset Password — {profile.full_name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        {success ? (
          <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Password reset successfully.</div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="label">New Password</label>
              <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
              <button onClick={() => { setPassword('QA123#00'); setConfirmPassword('QA123#00'); }} className="mt-1 text-xs text-brand-600 hover:underline">Use default (QA123#00)</button>
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input type="text" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" />
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Close</button>
          {!success && (
            <button onClick={handleReset} disabled={saving} className="btn-primary">
              <KeyRound className="h-4 w-4" /> {saving ? 'Resetting…' : 'Reset Password'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DeleteUserModal({ profile, onClose, onDeleted }: {
  profile: Profile;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    const { data, error } = await callManageUser({ action: 'delete', user_id: profile.id });
    if (error) { setError(error.message); setDeleting(false); return; }
    if (data?.error) { setError(String(data.error)); setDeleting(false); return; }
    onDeleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
            <Trash2 className="h-5 w-5 text-rose-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Delete User</h2>
            <p className="text-sm text-slate-500">This action cannot be undone.</p>
          </div>
        </div>
        {error && <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <p className="text-sm text-slate-600">
          Are you sure you want to delete <span className="font-semibold">{profile.full_name}</span> ({profile.email})?
          This will also remove their profile and project access.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={deleting} className="btn-danger">
            <Trash2 className="h-4 w-4" /> {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadUsersModal({ projects, onClose, onUploaded }: {
  projects: Project[];
  onClose: () => void;
  onUploaded: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<{ full_name: string; email: string; project_access: string; password: string; role: string; errors: string[] }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const handleFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    const parsedRows = rows.map((row, idx) => {
      const findVal = (keys: string[]) => { for (const k of keys) { for (const rk of Object.keys(row)) { if (rk.toLowerCase().trim() === k.toLowerCase()) return String(row[rk] ?? '').trim(); } } return ''; };
      const full_name = findVal(['Full Name', 'FullName', 'Name']);
      const email = findVal(['Email', 'Email Address']);
      const project_access = findVal(['Project Access', 'Project', 'Projects']);
      const password = findVal(['Password']);
      const role = findVal(['Role']).toLowerCase();
      const errors: string[] = [];
      if (!full_name) errors.push('Missing Full Name');
      if (!email) errors.push('Missing Email');
      if (!password) errors.push('Missing Password');
      if (role && !['admin', 'manager', 'quality', 'quality_expert', 'operation', 'supervisor', 'agent'].includes(role)) errors.push(`Invalid role: ${role}`);
      return { rowIndex: idx + 2, full_name, email, project_access, password, role: role || 'agent', errors };
    });
    setParsed(parsedRows);
  };

  const handleUpload = async () => {
    const valid = parsed.filter((r) => r.errors.length === 0);
    if (valid.length === 0) return;
    setUploading(true);
    let success = 0; let failed = 0;
    const errors: string[] = [];
    for (const r of valid) {
      const projectNames = r.project_access.split(',').map((s) => s.trim()).filter(Boolean);
      const projectIds = projects.filter((p) => projectNames.some((pn) => p.name.toLowerCase() === pn.toLowerCase())).map((p) => p.id);
      const { error } = await supabase.functions.invoke('manage-user', {
        body: { action: 'create', email: r.email, password: r.password, full_name: r.full_name, role: r.role, project_ids: projectIds },
      });
      if (error) { failed++; errors.push(`Row ${r.rowIndex} (${r.email}): ${error.message}`); }
      else success++;
    }
    setResults({ success, failed, errors });
    setUploading(false);
    if (failed === 0) setTimeout(onUploaded, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Upload Users</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        {!results && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <button onClick={() => downloadTemplate()} className="btn-ghost text-sm">
                <FileSpreadsheet className="h-4 w-4" /> Download Template
              </button>
            </div>
            <div
              onClick={() => fileRef.current?.click()}
              className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 p-8 hover:border-brand-400 hover:bg-brand-50/30"
            >
              <Upload className="h-8 w-8 text-slate-400" />
              <span className="mt-2 text-sm text-slate-500">Click to select an Excel file</span>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            {parsed.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold text-slate-600">Row</th>
                      <th className="px-3 py-2 font-semibold text-slate-600">Name</th>
                      <th className="px-3 py-2 font-semibold text-slate-600">Email</th>
                      <th className="px-3 py-2 font-semibold text-slate-600">Role</th>
                      <th className="px-3 py-2 font-semibold text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((r) => (
                      <tr key={r.rowIndex} className={cls('border-t', r.errors.length > 0 ? 'bg-rose-50' : 'bg-emerald-50/50')}>
                        <td className="px-3 py-2 text-slate-500">{r.rowIndex}</td>
                        <td className="px-3 py-2 text-slate-700">{r.full_name}</td>
                        <td className="px-3 py-2 text-slate-500">{r.email}</td>
                        <td className="px-3 py-2 text-slate-500">{r.role}</td>
                        <td className="px-3 py-2">{r.errors.length > 0 ? <span className="text-rose-600">{r.errors.join(', ')}</span> : <span className="text-emerald-600">OK</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="btn-secondary">Cancel</button>
              <button onClick={handleUpload} disabled={uploading || parsed.filter((r) => r.errors.length === 0).length === 0} className="btn-primary">
                <Upload className="h-4 w-4" /> {uploading ? 'Uploading…' : `Upload ${parsed.filter((r) => r.errors.length === 0).length} Users`}
              </button>
            </div>
          </>
        )}

        {results && (
          <div className="space-y-4">
            <div className={cls('rounded-lg p-4', results.failed === 0 ? 'bg-emerald-50' : 'bg-amber-50')}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {results.failed === 0 ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                Upload Complete: {results.success} succeeded, {results.failed} failed
              </div>
            </div>
            {results.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {results.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={onUploaded} className="btn-primary">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

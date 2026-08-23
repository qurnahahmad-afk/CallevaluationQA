import { useEffect, useMemo, useState } from 'react';
import {
  GraduationCap, CheckCircle2, Clock, Download, Calendar, User, ChevronRight,
  X, Save, Edit2, Timer, ShieldCheck, AlertCircle, Sparkles, MessageSquare,
  Plus, FileSpreadsheet, FileText, FileType, ClipboardList, Gauge, TrendingUp, Zap, XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import { useAuth } from '../lib/auth';
import { navigate } from '../lib/router';
import { useL } from '../lib/labels';
import { cls, fmtDate, fmtDateTime, todayISO, downloadCSV, downloadExcel, fmtDuration } from '../lib/utils';
import { TASK_TYPES } from '../lib/scorecard';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui';
import type { CoachingSession, Agent, Project, Evaluation, Profile } from '../types';

type CoachingRow = CoachingSession & {
  agent?: Pick<Agent, 'id' | 'agent_name' | 'lob' | 'team_leader' | 'coach_name' | 'manager_name'> | null;
  evaluation?: Pick<Evaluation, 'id' | 'call_score' | 'pass_fail' | 'evaluation_date' | 'transaction_link' | 'task_type' | 'transaction_type'> | null;
  project?: Pick<Project, 'id' | 'name'> | null;
};

const STATUSES = ['all', 'pending', 'conducted', 'confirmed'] as const;

export function CoachingPage() {
  const { activeProjectId, projects, profile, hasPermission } = useAuth();
  const L = useL();
  const isQualityOnly = (profile?.role === 'quality' || profile?.role === 'quality_expert') && !hasPermission('manage_users');
  const [sessions, setSessions] = useState<CoachingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [filterProject, setFilterProject] = useState('');
  const [filterLOB, setFilterLOB] = useState('');
  const [filterTask, setFilterTask] = useState('');
  const [filterCoach, setFilterCoach] = useState('');
  const [filterTeamLeader, setFilterTeamLeader] = useState('');
  const [filterSkill, setFilterSkill] = useState('');
  const [dateFilter, setDateFilter] = useState<'day' | 'month' | 'year'>('day');
  const [dateValue, setDateValue] = useState('');
  const [editingSession, setEditingSession] = useState<CoachingRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const availableLOBs = useMemo(() => {
    const proj = projects.find((p) => p.id === filterProject);
    if (proj?.lob_config && proj.lob_config.length > 0) return proj.lob_config;
    const set = new Set<string>();
    sessions.forEach((s) => { if (s.agent?.lob) set.add(s.agent.lob); });
    return Array.from(set).sort();
  }, [projects, filterProject, sessions]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      let q = supabase
        .from('coaching_sessions')
        .select('*, agent:agents(id, agent_name, lob, team_leader, coach_name, manager_name), evaluation:evaluations(id, call_score, pass_fail, evaluation_date, transaction_link, task_type, transaction_type, main_skill), project:projects(id, name)')
        .order('created_at', { ascending: false });
      const pid = filterProject || activeProjectId;
      if (pid) q = q.eq('project_id', pid);
      if (isQualityOnly && profile) q = q.eq('conducted_by', profile.id);
      const { data, error } = await q;
      if (!active) return;
      if (error) setError(error.message);
      else setSessions((data ?? []) as CoachingRow[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [activeProjectId, filterProject, isQualityOnly, profile]);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (filterLOB && s.agent?.lob !== filterLOB) return false;
      if (filterCoach && (s.agent?.coach_name ?? s.coach_name ?? '') !== filterCoach) return false;
      if (filterTeamLeader && (s.agent?.team_leader ?? '') !== filterTeamLeader) return false;
      if (filterSkill && (s.evaluation?.main_skill ?? '') !== filterSkill) return false;
      if (filterTask) {
        if (!s.evaluation || s.evaluation.task_type !== filterTask) return false;
      }
      if (dateValue && s.scheduled_date) {
        const d = s.scheduled_date.slice(0, 10);
        if (dateFilter === 'day' && d !== dateValue) return false;
        if (dateFilter === 'month' && d.slice(0, 7) !== dateValue) return false;
        if (dateFilter === 'year' && d.slice(0, 4) !== dateValue) return false;
      }
      return true;
    });
  }, [sessions, statusFilter, filterLOB, filterTask, filterCoach, filterTeamLeader, filterSkill, dateFilter, dateValue]);

  const coachingDashboard = useMemo(() => {
    const total = filtered.length;
    const pending = filtered.filter((s) => s.status === 'pending').length;
    const completed = filtered.filter((s) => s.status === 'conducted' || s.status === 'confirmed').length;
    const passed = filtered.filter((s) => s.evaluation?.pass_fail === 'Pass').length;
    const failed = filtered.filter((s) => s.evaluation?.pass_fail === 'Failed').length;
    const completedWithSla = filtered.filter((s) => s.status === 'conducted' || s.status === 'confirmed');
    const slaYes = completedWithSla.filter((s) => s.sla_met === true).length;
    const slaNo = completedWithSla.filter((s) => s.sla_met === false).length;
    const slaPct = (slaYes + slaNo) > 0 ? Math.round((slaYes / (slaYes + slaNo)) * 100) : 0;
    // Coaching count by category (strength, improvement, action)
    const withStrength = filtered.filter((s) => s.strength_points).length;
    const withImprovement = filtered.filter((s) => s.improvement_points).length;
    const withAction = filtered.filter((s) => s.action_points).length;
    return { total, pending, completed, passed, failed, slaYes, slaNo, slaPct, withStrength, withImprovement, withAction };
  }, [filtered]);

  const availableCoaches = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => { if (s.agent?.coach_name ?? s.coach_name) set.add(s.agent?.coach_name ?? s.coach_name ?? ''); });
    return Array.from(set).filter(Boolean).sort();
  }, [sessions]);

  const availableTeamLeaders = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => { if (s.agent?.team_leader) set.add(s.agent.team_leader); });
    return Array.from(set).filter(Boolean).sort();
  }, [sessions]);

  const availableSkills = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => { if (s.evaluation?.main_skill) set.add(s.evaluation.main_skill); });
    return Array.from(set).filter(Boolean).sort();
  }, [sessions]);

  const computeSla = (evaluationDate: string | null, conductedAt: string | null): { slaMet: boolean | null; slaHours: number | null } => {
    if (!evaluationDate || !conductedAt) return { slaMet: null, slaHours: null };
    const evalDate = new Date(evaluationDate);
    const condDate = new Date(conductedAt);
    const hours = Math.round((condDate.getTime() - evalDate.getTime()) / (1000 * 60 * 60) * 100) / 100;
    return { slaMet: hours <= 24, slaHours: hours };
  };

  const markConducted = async (session: CoachingRow) => {
    const now = new Date().toISOString();
    let slaMet: boolean | null = null;
    let slaHours: number | null = null;
    if (session.evaluation?.evaluation_date) {
      const evalDate = new Date(session.evaluation.evaluation_date);
      const condDate = new Date(now);
      slaHours = Math.round((condDate.getTime() - evalDate.getTime()) / (1000 * 60 * 60) * 100) / 100;
      slaMet = slaHours <= 24;
    }
    const { data, error } = await supabase
      .from('coaching_sessions')
      .update({ status: 'conducted', conducted_date: todayISO(), conducted_at: now, sla_met: slaMet, sla_hours: slaHours })
      .eq('id', session.id)
      .select('*, agent:agents(id, agent_name, lob, team_leader, coach_name, manager_name), evaluation:evaluations(id, call_score, pass_fail, evaluation_date, transaction_link, task_type, transaction_type, main_skill), project:projects(id, name)')
      .single();
    if (error) return;
    logAudit({ action: 'conduct', entity_type: 'coaching_session', entity_id: session.id, page_module: 'coaching', new_value: { status: 'conducted', sla_met: slaMet, sla_hours: slaHours } });
    setSessions((prev) => prev.map((s) => (s.id === session.id ? (data as CoachingRow) : s)));
  };

  const confirmSession = async (session: CoachingRow) => {
    const { data, error } = await supabase
      .from('coaching_sessions')
      .update({ status: 'confirmed' })
      .eq('id', session.id)
      .select('*, agent:agents(id, agent_name, lob, team_leader, coach_name, manager_name), evaluation:evaluations(id, call_score, pass_fail, evaluation_date, transaction_link, task_type, transaction_type, main_skill), project:projects(id, name)')
      .single();
    if (error) return;
    logAudit({ action: 'confirm', entity_type: 'coaching_session', entity_id: session.id, page_module: 'coaching', new_value: { status: 'confirmed' } });
    setSessions((prev) => prev.map((s) => (s.id === session.id ? (data as CoachingRow) : s)));
  };

  const saveSession = async (updated: Partial<CoachingSession> & { id: string; feedback_to_agent?: string }) => {
    const { data, error } = await supabase
      .from('coaching_sessions')
      .update({
        notes: updated.notes,
        strength_points: updated.strength_points,
        improvement_points: updated.improvement_points,
        action_points: updated.action_points,
        duration_minutes: updated.duration_minutes,
        feedback_to_agent: updated.feedback_to_agent,
      })
      .eq('id', updated.id)
      .select('*, agent:agents(id, agent_name, lob, team_leader, coach_name, manager_name), evaluation:evaluations(id, call_score, pass_fail, evaluation_date, transaction_link, task_type, transaction_type, main_skill), project:projects(id, name)')
      .single();
    if (error) return;
    logAudit({ action: 'update', entity_type: 'coaching_session', entity_id: updated.id, page_module: 'coaching', new_value: { notes: updated.notes, strength_points: updated.strength_points, improvement_points: updated.improvement_points, action_points: updated.action_points } });
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? (data as CoachingRow) : s)));
    setEditingSession(null);
  };

  const buildExportRows = (rows: CoachingRow[]) => rows.map((s) => ({
    id: s.id,
    agent: s.agent?.agent_name ?? '',
    coach: s.agent?.coach_name ?? s.coach_name ?? '',
    team_leader: s.agent?.team_leader ?? '',
    project: s.project?.name ?? '',
    lob: s.agent?.lob ?? '',
    status: s.status,
    scheduled_date: s.scheduled_date ?? '',
    conducted_date: s.conducted_date ?? '',
    duration_minutes: s.duration_minutes ?? '',
    sla_met: s.sla_met ?? '',
    sla_hours: s.sla_hours ?? '',
    evaluation_score: s.evaluation?.call_score ?? '',
    evaluation_pass_fail: s.evaluation?.pass_fail ?? '',
    transaction_link: s.evaluation?.transaction_link ?? '',
    feedback_to_agent: (s as CoachingSession & { feedback_to_agent?: string }).feedback_to_agent ?? '',
    strength_points: s.strength_points ?? '',
    improvement_points: s.improvement_points ?? '',
    action_points: s.action_points ?? '',
    notes: s.notes ?? '',
    created_at: s.created_at,
  }));

  const handleExportCSV = (rows: CoachingRow[], filename: string) => {
    downloadCSV(filename, buildExportRows(rows));
  };

  const handleExportExcel = (rows: CoachingRow[], filename: string) => {
    const exportRows = buildExportRows(rows);
    if (exportRows.length === 0) return;
    const headers = Object.keys(exportRows[0]);
    const lines = [headers.join('\t')];
    for (const row of exportRows) {
      lines.push(headers.map((h) => String(row[h as keyof typeof row] ?? '').replace(/\t/g, ' ')).join('\t'));
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = (rows: CoachingRow[], title: string) => {
    const exportRows = buildExportRows(rows);
    if (exportRows.length === 0) return;
    const headers = Object.keys(exportRows[0]);
    const win = window.open('', '_blank');
    if (!win) return;
    const rowsHtml = exportRows.map((row) =>
      `<tr>${headers.map((h) => `<td style="border:1px solid #ddd;padding:4px 8px;font-size:11px;">${String(row[h as keyof typeof row] ?? '').replace(/</g, '&lt;')}</td>`).join('')}</tr>`
    ).join('');
    win.document.write(`<html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;margin:20px}h1{font-size:18px}table{border-collapse:collapse;width:100%}th{background:#f1f5f9;text-align:left;font-size:11px;padding:4px 8px;border:1px solid #ddd}</style></head><body><h1>${title}</h1><p>Generated: ${new Date().toLocaleString()} · ${exportRows.length} rows</p><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`);
    win.document.close(); win.print();
  };

  if (loading) return <LoadingState label="Loading coaching sessions…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={L('page.coaching', 'Coaching')}
        subtitle={`Pending (${coachingDashboard.pending}) · ${filtered.length} sessions`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus className="h-4 w-4" /> {L('button.create_coaching', 'Create Coaching')}
            </button>
            <button onClick={() => handleExportCSV(filtered, 'coaching_sessions.csv')} disabled={filtered.length === 0} className="btn-ghost text-sm">
              <FileText className="h-4 w-4" /> {L('button.export_csv', 'CSV')}
            </button>
            <button onClick={() => handleExportExcel(filtered, 'coaching_sessions.xls')} disabled={filtered.length === 0} className="btn-ghost text-sm">
              <FileSpreadsheet className="h-4 w-4" /> {L('button.export_excel', 'Excel')}
            </button>
            <button onClick={() => handleExportPDF(filtered, 'Coaching Sessions Report')} disabled={filtered.length === 0} className="btn-ghost text-sm">
              <FileType className="h-4 w-4" /> {L('button.export_pdf', 'PDF')}
            </button>
          </div>
        }
      />

      {/* Coaching Dashboard KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="stat-card">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><ClipboardList className="h-5 w-5" /></div>
          <div className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{coachingDashboard.total}</div>
          <div className="text-xs text-slate-500">Total Coaching Sessions</div>
        </div>
        <div className="stat-card">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-50 text-warning-600"><Clock className="h-5 w-5" /></div>
          <div className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{coachingDashboard.pending}</div>
          <div className="text-xs text-slate-500">Total Pending Coaching</div>
        </div>
        <div className="stat-card">
          <div className="flex h-10 w-10 items-center rounded-lg bg-success-50 text-success-600"><CheckCircle2 className="h-5 w-5" /></div>
          <div className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{coachingDashboard.completed}</div>
          <div className="text-xs text-slate-500">Total Completed Coaching</div>
        </div>
        <div className="stat-card">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-50 text-accent-600"><Gauge className="h-5 w-5" /></div>
          <div className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{coachingDashboard.slaPct}%</div>
          <div className="text-xs text-slate-500">SLA %</div>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="stat-card">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-50 text-success-600"><CheckCircle2 className="h-5 w-5" /></div>
          <div className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{coachingDashboard.passed}</div>
          <div className="text-xs text-slate-500">Total Passed Evaluations</div>
        </div>
        <div className="stat-card">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-danger-50 text-danger-600"><XCircle className="h-5 w-5" /></div>
          <div className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{coachingDashboard.failed}</div>
          <div className="text-xs text-slate-500">Total Failed Evaluations</div>
        </div>
        <div className="stat-card">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-50 text-success-600"><ShieldCheck className="h-5 w-5" /></div>
          <div className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{coachingDashboard.slaYes}</div>
          <div className="text-xs text-slate-500">Coaching Within SLA</div>
        </div>
        <div className="stat-card">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-danger-50 text-danger-600"><AlertCircle className="h-5 w-5" /></div>
          <div className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{coachingDashboard.slaNo}</div>
          <div className="text-xs text-slate-500">Coaching Outside SLA</div>
        </div>
      </div>

      {/* Coaching by Category */}
      <div className="card p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700"><TrendingUp className="h-4 w-4 text-brand-600" /> Coaching Count by Category</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-emerald-50 p-3 text-center">
            <div className="text-lg font-bold text-emerald-700">{coachingDashboard.withStrength}</div>
            <div className="text-xs text-emerald-600">Strength Points</div>
          </div>
          <div className="rounded-lg bg-amber-50 p-3 text-center">
            <div className="text-lg font-bold text-amber-700">{coachingDashboard.withImprovement}</div>
            <div className="text-xs text-amber-600">Improvement Points</div>
          </div>
          <div className="rounded-lg bg-blue-50 p-3 text-center">
            <div className="text-lg font-bold text-blue-700">{coachingDashboard.withAction}</div>
            <div className="text-xs text-blue-600">Action Points</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-8">
        <div>
          <label className="label">Project</label>
          <select value={filterProject} onChange={(e) => { setFilterProject(e.target.value); setFilterLOB(''); }} className="input">
            <option value="">All Projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">LOB</label>
          <select value={filterLOB} onChange={(e) => setFilterLOB(e.target.value)} className="input">
            <option value="">All LOBs</option>
            {availableLOBs.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Task Type</label>
          <select value={filterTask} onChange={(e) => setFilterTask(e.target.value)} className="input">
            <option value="">All</option>
            {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Date Filter</label>
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as 'day' | 'month' | 'year')} className="input">
            <option value="day">Day</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>
        </div>
        <div>
          <label className="label">Date Value</label>
          {dateFilter === 'day' && <input type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)} className="input" />}
          {dateFilter === 'month' && <input type="month" value={dateValue} onChange={(e) => setDateValue(e.target.value)} className="input" />}
          {dateFilter === 'year' && (
            <select value={dateValue} onChange={(e) => setDateValue(e.target.value)} className="input">
              <option value="">Select year…</option>
              {Array.from({ length: 5 }, (_, i) => String(2024 + i)).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="label">Coach</label>
          <select value={filterCoach} onChange={(e) => setFilterCoach(e.target.value)} className="input">
            <option value="">All Coaches</option>
            {availableCoaches.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Team Leader</label>
          <select value={filterTeamLeader} onChange={(e) => setFilterTeamLeader(e.target.value)} className="input">
            <option value="">All Team Leaders</option>
            {availableTeamLeaders.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Skill</label>
          <select value={filterSkill} onChange={(e) => setFilterSkill(e.target.value)} className="input">
            <option value="">All Skills</option>
            {availableSkills.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={() => { setFilterProject(''); setFilterLOB(''); setFilterTask(''); setFilterCoach(''); setFilterTeamLeader(''); setFilterSkill(''); setDateValue(''); setStatusFilter('all'); }} className="btn-ghost text-xs">Clear Filters</button>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cls('rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition',
              statusFilter === s ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50')}>
            {s}
          </button>
        ))}
      </div>

      {/* Session cards */}
      {filtered.length === 0 ? (
        <EmptyState icon={<GraduationCap className="h-10 w-10" />} title="No coaching sessions" subtitle="Click Create Coaching to add one manually" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => {
            const isPending = s.status === 'pending';
            const slaCountdown = isPending && s.evaluation?.evaluation_date ? computeSla(s.evaluation.evaluation_date, new Date().toISOString()) : null;
            const isOverdue = slaCountdown && slaCountdown.slaHours !== null && slaCountdown.slaHours > 24;
            const hoursLeft = slaCountdown && slaCountdown.slaHours !== null ? Math.max(0, 24 - slaCountdown.slaHours) : null;
            return (
            <div key={s.id} className={cls('card p-5 transition', isPending && (isOverdue ? 'animate-pulse border-2 border-danger-300 bg-danger-50' : 'border-2 border-warning-300 bg-warning-50'))}>
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                    <User className="h-5 w-5 text-brand-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-700">{s.agent?.agent_name ?? '—'}</div>
                    <div className="text-xs text-slate-400">{s.project?.name ?? '—'} · {s.agent?.lob ?? '—'}</div>
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </div>
              <div className="space-y-1.5 text-xs text-slate-500">
                <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Scheduled: {fmtDate(s.scheduled_date)}</div>
                {s.conducted_date && <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Conducted: {fmtDate(s.conducted_date)}</div>}
                {s.evaluation && <div className="flex items-center gap-1.5"><span>Eval: <span className="font-semibold text-slate-700">{s.evaluation.call_score}</span> ({s.evaluation.pass_fail})</span></div>}
                {(() => {
                  const hasStored = s.sla_met !== null && s.sla_met !== undefined;
                  const isPending = s.status === 'pending' && s.evaluation?.evaluation_date;
                  if (!hasStored && !isPending) return null;
                  let slaMet: boolean | null = s.sla_met;
                  let slaHours: number | null = s.sla_hours;
                  if (isPending && !hasStored) {
                    const r = computeSla(s.evaluation!.evaluation_date, new Date().toISOString());
                    slaMet = r.slaMet; slaHours = r.slaHours;
                  }
                  return (
                    <div className="flex items-center gap-1.5">
                      {slaMet ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertCircle className="h-3.5 w-3.5 text-rose-600" />}
                      <span>SLA: {slaMet ? 'YES' : 'NO'} {slaHours !== null ? `(${slaHours}h)` : ''}</span>
                    </div>
                  );
                })()}
                {isPending && hoursLeft !== null && (
                  <div className={cls('mt-2 flex items-center gap-1.5 rounded-lg p-2 text-xs font-medium', isOverdue ? 'bg-danger-100 text-danger-700' : 'bg-warning-100 text-warning-700')}>
                    <Zap className="h-3.5 w-3.5" />
                    {isOverdue ? `SLA Overdue by ${Math.round(hoursLeft - 24)}h` : `SLA in ${Math.round(hoursLeft)}h`}
                  </div>
                )}
                {s.duration_minutes != null && <div className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5" /> Duration: {fmtDuration(s.duration_minutes * 60)}</div>}
              </div>
              {s.strength_points && <div className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700"><strong>Strengths:</strong> {s.strength_points}</div>}
              {s.improvement_points && <div className="mt-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-700"><strong>Improvement:</strong> {s.improvement_points}</div>}
              {s.action_points && <div className="mt-1 rounded-lg bg-blue-50 p-2 text-xs text-blue-700"><strong>Actions:</strong> {s.action_points}</div>}
              {s.notes && <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">{s.notes}</div>}
              <div className="mt-4 flex items-center gap-2">
                {s.evaluation && <button onClick={() => navigate({ name: 'evaluation', id: s.evaluation!.id })} className="btn-ghost text-xs">View Eval <ChevronRight className="h-3 w-3" /></button>}
                <button onClick={() => setEditingSession(s)} className="btn-ghost text-xs"><Edit2 className="h-3 w-3" /> Edit</button>
                <button onClick={() => handleExportCSV([s], `coaching_${s.id}.csv`)} className="btn-ghost text-xs"><Download className="h-3 w-3" /> Export</button>
                {s.status === 'pending' && <button onClick={() => markConducted(s)} className="btn-secondary text-xs"><CheckCircle2 className="h-3 w-3" /> Conduct</button>}
                {s.status === 'conducted' && <button onClick={() => confirmSession(s)} className="btn-primary text-xs"><CheckCircle2 className="h-3 w-3" /> Confirm</button>}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {editingSession && <EditCoachingModal session={editingSession} onClose={() => setEditingSession(null)} onSave={saveSession} />}
      {showCreate && <CreateCoachingModal projects={projects} profile={profile} onClose={() => setShowCreate(false)} onCreated={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateCoachingModal({ projects, profile, onClose, onCreated }: {
  projects: Project[];
  profile: Profile | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [agentId, setAgentId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [transactionLink, setTransactionLink] = useState('');
  const [evaluationDate, setEvaluationDate] = useState(todayISO());
  const [passFail, setPassFail] = useState<'Pass' | 'Failed'>('Failed');
  const [feedbackToAgent, setFeedbackToAgent] = useState('');
  const [durationH, setDurationH] = useState(0);
  const [durationM, setDurationM] = useState(0);
  const [durationS, setDurationS] = useState(0);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const { data } = await supabase.from('agents').select('*').eq('project_id', projectId).eq('active', true).order('agent_name');
      setAgents((data ?? []) as Agent[]);
    })();
  }, [projectId]);

  const selectedAgent = agents.find((a) => a.id === agentId);
  const durationSeconds = durationH * 3600 + durationM * 60 + durationS;

  const handleSave = async () => {
    if (!agentId || !projectId) { setError('Agent and project are required'); return; }
    setSaving(true);
    const { data, error } = await supabase.from('coaching_sessions').insert({
      agent_id: agentId,
      project_id: projectId,
      scheduled_date: evaluationDate,
      conducted_date: todayISO(),
      conducted_at: new Date().toISOString(),
      status: 'conducted',
      conducted_by: profile?.id ?? null,
      duration_minutes: Math.round(durationSeconds / 60),
      feedback_to_agent: feedbackToAgent,
      notes: '',
    }).select('*').single();
    setSaving(false);
    if (error) { setError(error.message); return; }
    logAudit({ action: 'create', entity_type: 'coaching_session', entity_id: data?.id, page_module: 'coaching', new_value: { agent_id: agentId, project_id: projectId, status: 'conducted' } });
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Create Coaching Session</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Project *</label>
              <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setAgentId(''); }} className="input">
                <option value="">Select project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Agent Name *</label>
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)} disabled={!projectId} className="input">
                <option value="">Select agent…</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.agent_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div><span className="text-slate-400">Coach:</span> <span className="font-medium text-slate-700">{selectedAgent?.coach_name ?? profile?.full_name ?? '—'}</span></div>
            <div><span className="text-slate-400">Team Leader:</span> <span className="font-medium text-slate-700">{selectedAgent?.team_leader ?? '—'}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Transaction Details</label>
              <input value={transactionLink} onChange={(e) => setTransactionLink(e.target.value)} className="input" placeholder="Transaction link/ID…" />
            </div>
            <div>
              <label className="label">Evaluation Date</label>
              <input type="date" value={evaluationDate} onChange={(e) => setEvaluationDate(e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Pass / Fail</label>
            <div className="flex gap-2">
              {(['Pass', 'Failed'] as const).map((opt) => (
                <button key={opt} onClick={() => setPassFail(opt)}
                  className={cls('rounded-lg border px-3 py-2 text-sm font-medium transition',
                    passFail === opt ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Feedback to Agent</label>
            <textarea value={feedbackToAgent} onChange={(e) => setFeedbackToAgent(e.target.value)} rows={3} className="input" placeholder="Provide feedback…" />
          </div>
          <div>
            <label className="label">Coaching Duration (HH:MM:SS)</label>
            <div className="flex items-center gap-2">
              <input type="number" min={0} value={durationH} onChange={(e) => setDurationH(Number(e.target.value))} className="input w-20" />
              <span className="text-slate-400">:</span>
              <input type="number" min={0} max={59} value={durationM} onChange={(e) => setDurationM(Number(e.target.value))} className="input w-20" />
              <span className="text-slate-400">:</span>
              <input type="number" min={0} max={59} value={durationS} onChange={(e) => setDurationS(Number(e.target.value))} className="input w-20" />
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary"><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function EditCoachingModal({ session, onClose, onSave }: {
  session: CoachingRow;
  onClose: () => void;
  onSave: (s: Partial<CoachingSession> & { id: string; feedback_to_agent?: string }) => void;
}) {
  const [notes, setNotes] = useState(session.notes ?? '');
  const [strengthPoints, setStrengthPoints] = useState(session.strength_points ?? '');
  const [improvementPoints, setImprovementPoints] = useState(session.improvement_points ?? '');
  const [actionPoints, setActionPoints] = useState(session.action_points ?? '');
  const [durationMinutes, setDurationMinutes] = useState(session.duration_minutes ?? 0);
  const [feedbackToAgent, setFeedbackToAgent] = useState((session as CoachingSession & { feedback_to_agent?: string }).feedback_to_agent ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    onSave({ id: session.id, notes, strength_points: strengthPoints, improvement_points: improvementPoints, action_points: actionPoints, duration_minutes: durationMinutes, feedback_to_agent: feedbackToAgent });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Coaching Form — {session.agent?.agent_name ?? '—'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div><span className="text-slate-400">Agent:</span> <span className="font-medium text-slate-700">{session.agent?.agent_name ?? '—'}</span></div>
            <div><span className="text-slate-400">Coach:</span> <span className="font-medium text-slate-700">{session.agent?.coach_name ?? session.coach_name ?? '—'}</span></div>
            <div><span className="text-slate-400">Team Leader:</span> <span className="font-medium text-slate-700">{session.agent?.team_leader ?? '—'}</span></div>
            <div><span className="text-slate-400">Eval Date:</span> <span className="font-medium text-slate-700">{fmtDate(session.evaluation?.evaluation_date ?? '')}</span></div>
            <div><span className="text-slate-400">Transaction:</span> <span className="font-medium text-slate-700">{session.evaluation?.transaction_link ?? '—'}</span></div>
            <div><span className="text-slate-400">Pass/Fail:</span> <span className="font-medium text-slate-700">{session.evaluation?.pass_fail ?? '—'}</span></div>
          </div>
          <div>
            <label className="label">Coaching Duration (HH:MM:SS)</label>
            <div className="flex items-center gap-2">
              <input type="number" min={0} value={Math.floor(durationMinutes / 60)} onChange={(e) => setDurationMinutes(Number(e.target.value) * 60 + (durationMinutes % 60))} className="input w-20" />
              <span className="text-slate-400">h</span>
              <input type="number" min={0} max={59} value={durationMinutes % 60} onChange={(e) => setDurationMinutes(Math.floor(durationMinutes / 60) * 60 + Number(e.target.value))} className="input w-20" />
              <span className="text-slate-400">m</span>
            </div>
          </div>
          <div>
            <label className="label">Feedback to Agent</label>
            <textarea value={feedbackToAgent} onChange={(e) => setFeedbackToAgent(e.target.value)} rows={3} className="input" placeholder="Provide feedback to the agent…" />
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><Sparkles className="h-4 w-4 text-brand-600" /> Development Areas</h3>
            <div className="space-y-3">
              <div><label className="label">Strength Points</label><textarea value={strengthPoints} onChange={(e) => setStrengthPoints(e.target.value)} rows={2} className="input" placeholder="What the agent did well…" /></div>
              <div><label className="label">Points Requiring Improvement</label><textarea value={improvementPoints} onChange={(e) => setImprovementPoints(e.target.value)} rows={2} className="input" placeholder="Areas needing improvement…" /></div>
              <div><label className="label">Action Points for Improvement</label><textarea value={actionPoints} onChange={(e) => setActionPoints(e.target.value)} rows={2} className="input" placeholder="Specific action items…" /></div>
            </div>
          </div>
          <div><label className="label">General Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input" placeholder="Additional notes…" /></div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary"><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'confirmed') return <span className="badge-pass"><CheckCircle2 className="h-3 w-3" /> Confirmed</span>;
  if (status === 'conducted') return <span className="badge-info">Conducted</span>;
  return <span className="badge-warning">Pending</span>;
}

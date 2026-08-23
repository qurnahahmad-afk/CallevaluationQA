import { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck, Clock, CheckCircle2, XCircle, Timer, TrendingUp, Award,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { cls, fmtDuration, fmtDate } from '../lib/utils';
import { TASK_TYPES } from '../lib/scorecard';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui';
import { useL } from '../lib/labels';
import type { CoachingSession, Agent, Project, Evaluation } from '../types';

type CoachingRow = CoachingSession & {
  agent?: Pick<Agent, 'id' | 'agent_name' | 'lob' | 'team_leader' | 'coach_name'> | null;
  evaluation?: Pick<Evaluation, 'id' | 'call_score' | 'pass_fail' | 'evaluation_date'> | null;
  project?: Pick<Project, 'id' | 'name'> | null;
};

const YES_COLOR = '#10b981';
const NO_COLOR = '#f43f5e';

export function CoachingDashboardPage() {
  const { activeProjectId, projects } = useAuth();
  const L = useL();
  const [sessions, setSessions] = useState<CoachingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterProject, setFilterProject] = useState('');
  const [filterLOB, setFilterLOB] = useState('');
  const [filterTask, setFilterTask] = useState('');
  const [filterCoach, setFilterCoach] = useState('');
  const [filterTeamLeader, setFilterTeamLeader] = useState('');
  const [dateFilter, setDateFilter] = useState<'day' | 'month' | 'year'>('day');
  const [dateValue, setDateValue] = useState('');

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
        .select('*, agent:agents(id, agent_name, lob, team_leader, coach_name), evaluation:evaluations(id, call_score, pass_fail, evaluation_date), project:projects(id, name)')
        .order('created_at', { ascending: false });
      const pid = filterProject || activeProjectId;
      if (pid) q = q.eq('project_id', pid);
      const { data, error } = await q;
      if (!active) return;
      if (error) setError(error.message);
      else setSessions((data ?? []) as CoachingRow[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [activeProjectId, filterProject]);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (filterLOB && s.agent?.lob !== filterLOB) return false;
      if (filterTask && s.evaluation?.task_type !== filterTask) return false;
      if (filterCoach && (s.agent?.coach_name ?? s.coach_name ?? '').toLowerCase() !== filterCoach.toLowerCase()) return false;
      if (filterTeamLeader && (s.agent?.team_leader ?? '').toLowerCase() !== filterTeamLeader.toLowerCase()) return false;
      if (dateValue && s.scheduled_date) {
        const d = s.scheduled_date.slice(0, 10);
        if (dateFilter === 'day' && d !== dateValue) return false;
        if (dateFilter === 'month' && d.slice(0, 7) !== dateValue) return false;
        if (dateFilter === 'year' && d.slice(0, 4) !== dateValue) return false;
      }
      return true;
    });
  }, [sessions, filterLOB, filterTask, filterCoach, filterTeamLeader, dateFilter, dateValue]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const totalDuration = filtered.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
    const slaYes = filtered.filter((s) => s.sla_met === true).length;
    const slaNo = filtered.filter((s) => s.sla_met === false).length;
    const slaPct = (slaYes + slaNo) > 0 ? Math.round((slaYes / (slaYes + slaNo)) * 100) : 0;
    return { total, totalDuration, slaYes, slaNo, slaPct };
  }, [filtered]);

  const slaPieData = useMemo(() => [
    { name: 'SLA Met (YES)', value: stats.slaYes, color: YES_COLOR },
    { name: 'SLA Missed (NO)', value: stats.slaNo, color: NO_COLOR },
  ], [stats.slaYes, stats.slaNo]);

  const coachPerformance = useMemo(() => {
    const map = new Map<string, { name: string; sessions: number; slaYes: number; slaNo: number; totalDuration: number }>();
    for (const s of filtered) {
      const coach = s.agent?.coach_name ?? s.coach_name ?? '—';
      const cur = map.get(coach) ?? { name: coach, sessions: 0, slaYes: 0, slaNo: 0, totalDuration: 0 };
      cur.sessions += 1;
      if (s.sla_met === true) cur.slaYes += 1;
      if (s.sla_met === false) cur.slaNo += 1;
      cur.totalDuration += s.duration_minutes ?? 0;
      map.set(coach, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.sessions - a.sessions).slice(0, 10);
  }, [filtered]);

  if (loading) return <LoadingState label="Loading coaching dashboard…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <PageHeader title={L('page.coaching_dashboard', 'Coaching Dashboard')} subtitle="Coaching KPIs and SLA tracking" />

      {/* Filters */}
      <div className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-7">
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
          <label className="label">Coach Name</label>
          <input value={filterCoach} onChange={(e) => setFilterCoach(e.target.value)} placeholder="Filter…" className="input" />
        </div>
        <div>
          <label className="label">Team Leader</label>
          <input value={filterTeamLeader} onChange={(e) => setFilterTeamLeader(e.target.value)} placeholder="Filter…" className="input" />
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
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={<ClipboardCheck className="h-5 w-5" />} label="Total Coaching Sessions" value={String(stats.total)} tone="brand" />
        <KpiCard icon={<CheckCircle2 className="h-5 w-5" />} label="Coaching Completed Within SLA" value={String(stats.slaYes)} tone="emerald" sub="≤ 24 hours" />
        <KpiCard icon={<XCircle className="h-5 w-5" />} label="Coaching Completed Outside SLA" value={String(stats.slaNo)} tone="rose" sub="> 24 hours" />
        <KpiCard icon={<Timer className="h-5 w-5" />} label="SLA Percentage" value={`${stats.slaPct}%`} tone="amber" sub={`SLA% = ${stats.slaYes} / (${stats.slaYes} + ${stats.slaNo}) x 100`} />
      </div>

      {/* SLA Distribution + Coach Performance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">Coaching SLA Distribution</h3>
          {stats.slaYes + stats.slaNo === 0 ? (
            <EmptyState title="No SLA data" subtitle="SLA is calculated when coaching is marked as conducted" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={slaPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {slaPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-emerald-50 p-2">
                  <div className="text-lg font-bold text-emerald-700">{stats.slaYes}</div>
                  <div className="text-xs text-emerald-600">Total YES (≤24h)</div>
                </div>
                <div className="rounded-lg bg-rose-50 p-2">
                  <div className="text-lg font-bold text-rose-700">{stats.slaNo}</div>
                  <div className="text-xs text-rose-600">Total NO (&gt;24h)</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Award className="h-4 w-4 text-brand-600" /> Coach Performance
          </h3>
          {coachPerformance.length === 0 ? (
            <EmptyState title="No data" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={coachPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip />
                <Bar dataKey="sessions" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Coach performance table */}
      {coachPerformance.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="px-4 py-3 font-semibold">Coach</th>
                  <th className="px-4 py-3 font-semibold text-center">Sessions</th>
                  <th className="px-4 py-3 font-semibold text-center">SLA YES</th>
                  <th className="px-4 py-3 font-semibold text-center">SLA NO</th>
                  <th className="px-4 py-3 font-semibold text-center">SLA %</th>
                  <th className="px-4 py-3 font-semibold text-center">Total Duration</th>
                </tr>
              </thead>
              <tbody>
                {coachPerformance.map((c) => {
                  const slaPct = (c.slaYes + c.slaNo) > 0 ? Math.round((c.slaYes / (c.slaYes + c.slaNo)) * 100) : 0;
                  return (
                    <tr key={c.name} className="table-row">
                      <td className="px-4 py-3 font-medium text-slate-700">{c.name}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{c.sessions}</td>
                      <td className="px-4 py-3 text-center"><span className="text-emerald-600 font-semibold">{c.slaYes}</span></td>
                      <td className="px-4 py-3 text-center"><span className="text-rose-600 font-semibold">{c.slaNo}</span></td>
                      <td className="px-4 py-3 text-center">
                        <span className={cls('font-bold tabular-nums', slaPct >= 80 ? 'text-emerald-600' : slaPct >= 50 ? 'text-amber-600' : 'text-rose-600')}>
                          {slaPct}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-500">{fmtDuration(c.totalDuration * 60)}</td>
                    </tr>
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

function KpiCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone: 'brand' | 'blue' | 'emerald' | 'amber' | 'rose' }) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
  };
  return (
    <div className="stat-card">
      <div className={cls('flex h-10 w-10 items-center justify-center rounded-lg', tones[tone])}>{icon}</div>
      <div className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

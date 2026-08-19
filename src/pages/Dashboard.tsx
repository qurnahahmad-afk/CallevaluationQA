import { useEffect, useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend, LineChart, Line,
} from 'recharts';
import {
  ClipboardList, CheckCircle2, XCircle, TrendingUp, Users, GraduationCap,
  Award, ChevronRight, Gauge, ShieldCheck, Briefcase, Scale, Sparkles,
  Clock, BarChart3, Download, FileSpreadsheet,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useL } from '../lib/labels';
import { navigate } from '../lib/router';
import { cls, fmtDateTime, fmtDuration, downloadExcel, getTargetTone, toneBg, toneBar } from '../lib/utils';
import { computeAccuracyForEvaluations, TASK_TYPES, TRANSACTION_TYPES } from '../lib/scorecard';
import { useProjectTargets } from '../lib/hooks';
import { PageHeader, ScoreBadge, LoadingState, ErrorState, EmptyState } from '../components/ui';
import type { Evaluation, CoachingSession, Agent, FormConfig } from '../types';

type DashboardRow = Evaluation & {
  agent?: Pick<Agent, 'id' | 'agent_name' | 'lob' | 'team_leader' | 'project_id'> | null;
  project?: { id: string; name: string } | null;
  coach_profile?: { id: string; full_name: string; email: string } | null;
};

const CUSTOMER_COLOR = '#10b981';
const BUSINESS_COLOR = '#3b82f6';
const COMPLIANCE_COLOR = '#f59e0b';
const NONCRIT_COLOR = '#6366f1';

export function Dashboard() {
  const { activeProjectId, projects } = useAuth();
  const L = useL();
  const { getTarget } = useProjectTargets(activeProjectId);
  const [evaluations, setEvaluations] = useState<DashboardRow[]>([]);
  const [coaching, setCoaching] = useState<CoachingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterProject, setFilterProject] = useState('');
  const [filterLOB, setFilterLOB] = useState('');
  const [filterTask, setFilterTask] = useState('');
  const [filterTransaction, setFilterTransaction] = useState('');
  const [filterCoach, setFilterCoach] = useState('');
  const [dateFilter, setDateFilter] = useState<'day' | 'month' | 'year'>('day');
  const [dateValue, setDateValue] = useState('');

  const activeProjectIdResolved = filterProject || activeProjectId;

  const availableLOBs = useMemo(() => {
    const proj = projects.find((p) => p.id === filterProject);
    if (proj?.lob_config && proj.lob_config.length > 0) return proj.lob_config;
    const set = new Set<string>();
    evaluations.forEach((e) => { if (e.agent?.lob) set.add(e.agent.lob); });
    return Array.from(set).sort();
  }, [projects, filterProject, evaluations]);

  const availableCoaches = useMemo(() => {
    const map = new Map<string, string>();
    evaluations.forEach((e) => {
      const id = e.coach_profile?.id ?? e.coach_id;
      const name = e.coach_profile?.full_name ?? e.coach_name;
      if (id && name) map.set(id, name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [evaluations]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      let evalQuery = supabase
        .from('evaluations')
        .select('*, agent:agents(id, agent_name, lob, team_leader, project_id), project:projects(id, name), coach_profile:profiles(id, full_name, email)')
        .order('created_at', { ascending: false })
        .limit(500);
      const projectId = filterProject || activeProjectId;
      if (projectId) evalQuery = evalQuery.eq('project_id', projectId);
      const { data: evalData, error: evalError } = await evalQuery;

      let coachingQuery = supabase.from('coaching_sessions').select('*, agent:agents(id, agent_name), evaluation:evaluations(id, call_score, pass_fail), project:projects(id, name)').order('created_at', { ascending: false }).limit(200);
      if (projectId) coachingQuery = coachingQuery.eq('project_id', projectId);
      const { data: coachingData, error: coachingError } = await coachingQuery;

      if (!active) return;
      if (evalError) setError(evalError.message);
      else if (coachingError) setError(coachingError.message);
      else {
        setEvaluations((evalData ?? []) as DashboardRow[]);
        setCoaching((coachingData ?? []) as CoachingSession[]);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [activeProjectId, filterProject]);

  const filteredEvaluations = useMemo(() => {
    return evaluations.filter((e) => {
      if (filterLOB && e.agent?.lob !== filterLOB) return false;
      if (filterTask && e.task_type !== filterTask) return false;
      if (filterTransaction && e.transaction_type !== filterTransaction) return false;
      if (filterCoach) {
        const coachId = e.coach_profile?.id ?? e.coach_id;
        if (coachId !== filterCoach) return false;
      }
      if (dateValue && e.evaluation_date) {
        const evDate = e.evaluation_date.slice(0, 10);
        if (dateFilter === 'day' && evDate !== dateValue) return false;
        if (dateFilter === 'month' && evDate.slice(0, 7) !== dateValue) return false;
        if (dateFilter === 'year' && evDate.slice(0, 4) !== dateValue) return false;
      }
      return true;
    });
  }, [evaluations, filterLOB, filterTask, filterTransaction, filterCoach, dateFilter, dateValue]);

  const stats = useMemo(() => {
    const total = filteredEvaluations.length;
    const passed = filteredEvaluations.filter((e) => e.pass_fail === 'Pass').length;
    const failed = filteredEvaluations.filter((e) => e.pass_fail === 'Failed').length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    const failRate = total > 0 ? Math.round((failed / total) * 100) : 0;
    const avgScore = total > 0 ? Math.round(filteredEvaluations.reduce((sum, e) => sum + (e.call_score ?? 0), 0) / total) : 0;
    const activeAgentIds = new Set(filteredEvaluations.map((e) => e.agent_id).filter(Boolean));
    return { total, passed, failed, passRate, failRate, avgScore, activeAgents: activeAgentIds.size };
  }, [filteredEvaluations]);

  const accuracy = useMemo(() => computeAccuracyForEvaluations(filteredEvaluations), [filteredEvaluations]);

  const pieData = useMemo(() => [
    { name: 'Pass', value: stats.passed, color: '#16a34a' },
    { name: 'Failed', value: stats.failed, color: '#dc2626' },
  ], [stats.passed, stats.failed]);

  const coachingStats = useMemo(() => {
    const pending = coaching.filter((c) => c.status === 'pending').length;
    const conducted = coaching.filter((c) => c.status === 'conducted').length;
    const confirmed = coaching.filter((c) => c.status === 'confirmed').length;
    const completed = coaching.filter((c) => c.status === 'conducted' || c.status === 'confirmed');
    const slaYes = completed.filter((c) => c.sla_met === true).length;
    const slaNo = completed.filter((c) => c.sla_met === false).length;
    const slaPct = (slaYes + slaNo) > 0 ? Math.round((slaYes / (slaYes + slaNo)) * 100) : 0;
    return { pending, conducted, confirmed, total: coaching.length, slaYes, slaNo, slaPct };
  }, [coaching]);

  const trendData = useMemo(() => {
    const byWeek = new Map<string, { customer: { errors: number; calls: number }; business: { errors: number; calls: number }; compliance: { errors: number; calls: number }; nonCrit: { errors: number; calls: number } }>();
    for (const ev of filteredEvaluations) {
      const date = ev.evaluation_date ?? '';
      if (!date) continue;
      const d = new Date(date);
      const week = getWeekKey(d);
      const cur = byWeek.get(week) ?? {
        customer: { errors: 0, calls: 0 },
        business: { errors: 0, calls: 0 },
        compliance: { errors: 0, calls: 0 },
        nonCrit: { errors: 0, calls: 0 },
      };
      const config = (ev.form_config ?? null) as FormConfig | null;
      const catMap: Record<string, string> = {};
      if (config) for (const cat of config.categories) catMap[cat.key] = cat.critical ? cat.key : 'NonCritical';
      const answeredCats = new Set<string>();
      for (const item of (ev.checklist ?? [])) {
        if (item.answer === null || item.answer === 'N/A') continue;
        const bucket = catMap[item.category] || 'NonCritical';
        const key = bucket === 'Customer Critical' ? 'customer' : bucket === 'Business Critical' ? 'business' : bucket === 'Compliance Critical' ? 'compliance' : 'nonCrit';
        if (item.answer === 'No') cur[key].errors++;
        answeredCats.add(key);
      }
      for (const key of answeredCats) cur[key].calls++;
      byWeek.set(week, cur);
    }
    const calc = (c: { errors: number; calls: number }) => c.calls > 0 ? Math.round(100 - (c.errors / c.calls) * 100) : 0;
    return Array.from(byWeek.entries())
      .map(([week, v]) => ({
        week,
        customer: calc(v.customer),
        business: calc(v.business),
        compliance: calc(v.compliance),
        nonCritical: calc(v.nonCrit),
      }))
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-12);
  }, [filteredEvaluations]);

  const topPerformers = useMemo(() => {
    const agentMap = new Map<string, { name: string; scores: number[]; count: number; errors: { customer: number; business: number; compliance: number; nonCrit: number }; calls: { customer: number; business: number; compliance: number; nonCrit: number }; coachingCount: number }>();
    for (const ev of filteredEvaluations) {
      if (!ev.agent_id || !ev.agent) continue;
      const key = ev.agent_id;
      const cur = agentMap.get(key) ?? { name: ev.agent.agent_name, scores: [], count: 0, errors: { customer: 0, business: 0, compliance: 0, nonCrit: 0 }, calls: { customer: 0, business: 0, compliance: 0, nonCrit: 0 }, coachingCount: 0 };
      cur.scores.push(ev.call_score ?? 0);
      cur.count += 1;
      const config = (ev.form_config ?? null) as FormConfig | null;
      const catMap: Record<string, string> = {};
      if (config) for (const cat of config.categories) catMap[cat.key] = cat.critical ? cat.key : 'NonCritical';
      const answeredCats = new Set<string>();
      for (const item of (ev.checklist ?? [])) {
        if (item.answer === null || item.answer === 'N/A') continue;
        const bucket = catMap[item.category] || 'NonCritical';
        const k = bucket === 'Customer Critical' ? 'customer' : bucket === 'Business Critical' ? 'business' : bucket === 'Compliance Critical' ? 'compliance' : 'nonCrit';
        if (item.answer === 'No') cur.errors[k]++;
        answeredCats.add(k);
      }
      for (const k of answeredCats) cur.calls[k]++;
      agentMap.set(key, cur);
    }
    // Add coaching counts
    for (const c of coaching) {
      if (c.agent_id && agentMap.has(c.agent_id)) {
        agentMap.get(c.agent_id)!.coachingCount++;
      }
    }
    const calc = (e: number, c: number) => c > 0 ? Math.round(100 - (e / c) * 100) : 0;
    return Array.from(agentMap.entries())
      .map(([id, v]) => ({
        id, name: v.name, count: v.count,
        avgScore: Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length),
        customerAccuracy: calc(v.errors.customer, v.calls.customer),
        businessAccuracy: calc(v.errors.business, v.calls.business),
        complianceAccuracy: calc(v.errors.compliance, v.calls.compliance),
        nonCritAccuracy: calc(v.errors.nonCrit, v.calls.nonCrit),
        coachingCount: v.coachingCount,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10);
  }, [filteredEvaluations, coaching]);

  const topLOBs = useMemo(() => {
    const lobMap = new Map<string, { total: number; scores: number[]; errors: { customer: number; business: number; compliance: number; nonCrit: number }; calls: { customer: number; business: number; compliance: number; nonCrit: number } }>();
    for (const ev of filteredEvaluations) {
      const lob = ev.agent?.lob ?? 'Unassigned';
      const cur = lobMap.get(lob) ?? { total: 0, scores: [], errors: { customer: 0, business: 0, compliance: 0, nonCrit: 0 }, calls: { customer: 0, business: 0, compliance: 0, nonCrit: 0 } };
      cur.total += 1;
      cur.scores.push(ev.call_score ?? 0);
      const config = (ev.form_config ?? null) as FormConfig | null;
      const catMap: Record<string, string> = {};
      if (config) for (const cat of config.categories) catMap[cat.key] = cat.critical ? cat.key : 'NonCritical';
      const answeredCats = new Set<string>();
      for (const item of (ev.checklist ?? [])) {
        if (item.answer === null || item.answer === 'N/A') continue;
        const bucket = catMap[item.category] || 'NonCritical';
        const k = bucket === 'Customer Critical' ? 'customer' : bucket === 'Business Critical' ? 'business' : bucket === 'Compliance Critical' ? 'compliance' : 'nonCrit';
        if (item.answer === 'No') cur.errors[k]++;
        answeredCats.add(k);
      }
      for (const k of answeredCats) cur.calls[k]++;
      lobMap.set(lob, cur);
    }
    const calc = (e: number, c: number) => c > 0 ? Math.round(100 - (e / c) * 100) : 0;
    return Array.from(lobMap.entries()).map(([lob, v]) => ({
      lob, total: v.total,
      avgScore: v.scores.length > 0 ? Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length) : 0,
      customerAccuracy: calc(v.errors.customer, v.calls.customer),
      businessAccuracy: calc(v.errors.business, v.calls.business),
      complianceAccuracy: calc(v.errors.compliance, v.calls.compliance),
      nonCritAccuracy: calc(v.errors.nonCrit, v.calls.nonCrit),
    })).sort((a, b) => b.avgScore - a.avgScore).slice(0, 10);
  }, [filteredEvaluations]);

  const recentEvals = filteredEvaluations.slice(0, 10);

  if (loading) return <LoadingState label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} />;

  const projectName = activeProjectIdResolved ? projects.find((p) => p.id === activeProjectIdResolved)?.name : null;

  const handleExportExcel = () => {
    const rows = filteredEvaluations.map((e) => ({
      Agent: e.agent?.agent_name ?? '',
      Project: e.project?.name ?? '',
      LOB: e.agent?.lob ?? '',
      Skill: e.main_skill ?? '',
      Task_Type: e.task_type ?? '',
      Transaction_Type: e.transaction_type ?? '',
      Coach: e.coach_profile?.full_name ?? e.coach_name ?? '',
      Evaluation_Date: e.evaluation_date ?? '',
      Call_Score: e.call_score ?? '',
      Pass_Fail: e.pass_fail ?? '',
    }));
    downloadExcel('dashboard_evaluations.xls', rows);
  };

  const handleExportFullExcel = () => {
    // Summary sheet
    const summaryRows = [
      { Metric: 'Total Evaluations', Value: stats.total },
      { Metric: 'Passed', Value: stats.passed },
      { Metric: 'Failed', Value: stats.failed },
      { Metric: 'Pass Rate (%)', Value: stats.passRate },
      { Metric: 'Fail Rate (%)', Value: stats.failRate },
      { Metric: 'Average Score', Value: stats.avgScore },
      { Metric: 'Customer Critical Accuracy (%)', Value: accuracy.customerCritical.accuracy },
      { Metric: 'Customer Critical Errors', Value: accuracy.customerCritical.errors },
      { Metric: 'Customer Critical Evaluated Calls', Value: accuracy.customerCritical.evaluatedCalls },
      { Metric: 'Business Critical Accuracy (%)', Value: accuracy.businessCritical.accuracy },
      { Metric: 'Business Critical Errors', Value: accuracy.businessCritical.errors },
      { Metric: 'Business Critical Evaluated Calls', Value: accuracy.businessCritical.evaluatedCalls },
      { Metric: 'Compliance Critical Accuracy (%)', Value: accuracy.complianceCritical.accuracy },
      { Metric: 'Compliance Critical Errors', Value: accuracy.complianceCritical.errors },
      { Metric: 'Compliance Critical Evaluated Calls', Value: accuracy.complianceCritical.evaluatedCalls },
      { Metric: 'Soft Skills Accuracy (%)', Value: accuracy.nonCritical.accuracy },
      { Metric: 'Soft Skills Errors', Value: accuracy.nonCritical.errors },
      { Metric: 'Soft Skills Evaluated Calls', Value: accuracy.nonCritical.evaluatedCalls },
      { Metric: 'Coaching Pending', Value: coachingStats.pending },
      { Metric: 'Coaching Conducted', Value: coachingStats.conducted },
      { Metric: 'Coaching Confirmed', Value: coachingStats.confirmed },
      { Metric: 'Coaching SLA %', Value: coachingStats.slaPct },
      { Metric: 'Coaching Within SLA', Value: coachingStats.slaYes },
      { Metric: 'Coaching Outside SLA', Value: coachingStats.slaNo },
    ];
    downloadExcel('dashboard_summary.xls', summaryRows);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={L('page.dashboard', 'Dashboard')}
        subtitle={projectName ? `Filtered: ${projectName}` : 'All projects overview'}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={handleExportExcel} disabled={filteredEvaluations.length === 0} className="btn-secondary">
              <Download className="h-4 w-4" /> Export Evaluations
            </button>
            <button onClick={handleExportFullExcel} className="btn-primary">
              <FileSpreadsheet className="h-4 w-4" /> Export Dashboard
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-7">
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
          <label className="label">Transaction Type</label>
          <select value={filterTransaction} onChange={(e) => setFilterTransaction(e.target.value)} className="input">
            <option value="">All</option>
            {TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Coach</label>
          <select value={filterCoach} onChange={(e) => setFilterCoach(e.target.value)} className="input">
            <option value="">All Coaches</option>
            {availableCoaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
      </div>

      {/* KPI Row 1: Core metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<ClipboardList className="h-5 w-5" />} label="Total Evaluations" value={String(stats.total)} tone="brand" />
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Average Score" value={String(stats.avgScore)} tone="amber" />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Pass Rate" value={`${stats.passRate}%`} sub={`${stats.passed} passed`} tone="emerald" />
        <StatCard icon={<XCircle className="h-5 w-5" />} label="Fail Rate" value={`${stats.failRate}%`} sub={`${stats.failed} failed`} tone="rose" />
      </div>

      {/* KPI Row 2: Accuracy metrics with details and target colors */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AccuracyCard
          icon={<ShieldCheck className="h-5 w-5" />}
          label="Customer Critical Accuracy"
          detail={accuracy.customerCritical}
          target={getTarget('customer_critical', activeProjectIdResolved)}
        />
        <AccuracyCard
          icon={<Briefcase className="h-5 w-5" />}
          label="Business Critical Accuracy"
          detail={accuracy.businessCritical}
          target={getTarget('business_critical', activeProjectIdResolved)}
        />
        <AccuracyCard
          icon={<Scale className="h-5 w-5" />}
          label="Compliance Critical Accuracy"
          detail={accuracy.complianceCritical}
          target={getTarget('compliance_critical', activeProjectIdResolved)}
        />
        <AccuracyCard
          icon={<Sparkles className="h-5 w-5" />}
          label="Soft Skills / Non-Critical Accuracy"
          detail={accuracy.nonCritical}
          target={getTarget('soft_skills', activeProjectIdResolved)}
        />
      </div>

      {/* Pass/Fail + Coaching */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <h3 className="mb-4 section-title"><PieChart className="h-4 w-4 text-brand-600" /> Pass / Fail Distribution</h3>
          {stats.total === 0 ? (
            <EmptyState title="No data" subtitle="No evaluations yet" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-success-50 p-2.5">
                  <div className="text-lg font-bold text-success-700">{stats.passed}</div>
                  <div className="text-xs text-success-600">Total Pass</div>
                </div>
                <div className="rounded-lg bg-danger-50 p-2.5">
                  <div className="text-lg font-bold text-danger-700">{stats.failed}</div>
                  <div className="text-xs text-danger-600">Total Fail</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="card p-5">
          <h3 className="mb-4 section-title"><Gauge className="h-4 w-4 text-brand-600" /> Quality Efficiency</h3>
          <div className="flex flex-col items-center justify-center gap-3 py-4">
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums text-slate-900">{stats.avgScore}</div>
              <div className="text-xs text-slate-500">Average Score</div>
            </div>
            <div className="w-full rounded-lg bg-slate-50 p-3 text-center">
              <span className="text-xs text-slate-500">Evaluations: </span>
              <span className="text-sm font-semibold text-slate-700">{stats.total}</span>
            </div>
            <div className="w-full rounded-lg bg-brand-50 p-3 text-center">
              <span className="text-xs text-brand-700">Active Agents: </span>
              <span className="text-sm font-semibold text-brand-700">{stats.activeAgents}</span>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 section-title"><GraduationCap className="h-4 w-4 text-brand-600" /> Coaching Sessions</h3>
          <div className="space-y-2">
            <CoachingRow icon={<Clock className="h-4 w-4" />} label="Pending" value={coachingStats.pending} tone="amber" />
            <CoachingRow icon={<CheckCircle2 className="h-4 w-4" />} label="Conducted" value={coachingStats.conducted} tone="blue" />
            <CoachingRow icon={<Award className="h-4 w-4" />} label="Confirmed" value={coachingStats.confirmed} tone="emerald" />
            <CoachingRow icon={<ClipboardList className="h-4 w-4" />} label="Total" value={coachingStats.total} tone="slate" />
            <div className="mt-3 rounded-lg bg-slate-50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">SLA %</span>
                <span className="font-bold tabular-nums text-slate-900">{coachingStats.slaPct}%</span>
              </div>
              <div className="mt-1 flex gap-3 text-xs text-slate-400">
                <span>Within SLA: {coachingStats.slaYes}</span>
                <span>Outside SLA: {coachingStats.slaNo}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Accuracy Trend */}
      <div className="card p-5">
        <h3 className="mb-4 section-title"><TrendingUp className="h-4 w-4 text-brand-600" /> Accuracy Trend (Weekly)</h3>
        {trendData.length === 0 ? (
          <EmptyState title="No data" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
              <Legend />
              <Line type="monotone" dataKey="customer" name="Customer Critical" stroke={CUSTOMER_COLOR} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="business" name="Business Critical" stroke={BUSINESS_COLOR} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="compliance" name="Compliance Critical" stroke={COMPLIANCE_COLOR} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="nonCritical" name="Soft Skills" stroke={NONCRIT_COLOR} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top Performers: Agents + LOBs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="section-title"><Award className="h-4 w-4 text-brand-600" /> Top Performing Agents</h3>
            <button onClick={() => downloadExcel('top_agents.xls', topPerformers.map((p) => ({ Agent: p.name, Evaluated_Calls: p.count, Customer_Critical_Accuracy: p.customerAccuracy, Business_Critical_Accuracy: p.businessAccuracy, Compliance_Critical_Accuracy: p.complianceAccuracy, Soft_Skills_Accuracy: p.nonCritAccuracy, Average_Score: p.avgScore, Coaching_Sessions: p.coachingCount })))} className="btn-ghost text-xs">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>
          {topPerformers.length === 0 ? (
            <div className="p-5"><EmptyState icon={<Award className="h-8 w-8" />} title="No data" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="px-3 py-2 text-left font-semibold">Agent</th>
                    <th className="px-3 py-2 text-center font-semibold">Calls</th>
                    <th className="px-3 py-2 text-center font-semibold">Cust</th>
                    <th className="px-3 py-2 text-center font-semibold">Bus</th>
                    <th className="px-3 py-2 text-center font-semibold">Comp</th>
                    <th className="px-3 py-2 text-center font-semibold">Soft</th>
                    <th className="px-3 py-2 text-center font-semibold">Avg</th>
                    <th className="px-3 py-2 text-center font-semibold">Coach</th>
                  </tr>
                </thead>
                <tbody>
                  {topPerformers.map((p) => (
                    <tr key={p.id} className="table-row">
                      <td className="px-3 py-2 font-medium text-slate-700">{p.name}</td>
                      <td className="px-3 py-2 text-center text-slate-500">{p.count}</td>
                      <td className="px-3 py-2 text-center"><AccCell value={p.customerAccuracy} target={getTarget('customer_critical', activeProjectIdResolved)} /></td>
                      <td className="px-3 py-2 text-center"><AccCell value={p.businessAccuracy} target={getTarget('business_critical', activeProjectIdResolved)} /></td>
                      <td className="px-3 py-2 text-center"><AccCell value={p.complianceAccuracy} target={getTarget('compliance_critical', activeProjectIdResolved)} /></td>
                      <td className="px-3 py-2 text-center"><AccCell value={p.nonCritAccuracy} target={getTarget('soft_skills', activeProjectIdResolved)} /></td>
                      <td className="px-3 py-2 text-center font-bold tabular-nums text-slate-900">{p.avgScore}</td>
                      <td className="px-3 py-2 text-center text-slate-500">{p.coachingCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="section-title"><BarChart3 className="h-4 w-4 text-brand-600" /> Top Performing LOBs</h3>
            <button onClick={() => downloadExcel('top_lobs.xls', topLOBs.map((l) => ({ LOB: l.lob, Evaluated_Calls: l.total, Customer_Critical_Accuracy: l.customerAccuracy, Business_Critical_Accuracy: l.businessAccuracy, Compliance_Critical_Accuracy: l.complianceAccuracy, Soft_Skills_Accuracy: l.nonCritAccuracy, Average_Score: l.avgScore })))} className="btn-ghost text-xs">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>
          {topLOBs.length === 0 ? (
            <div className="p-5"><EmptyState icon={<BarChart3 className="h-8 w-8" />} title="No data" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="px-3 py-2 text-left font-semibold">LOB</th>
                    <th className="px-3 py-2 text-center font-semibold">Calls</th>
                    <th className="px-3 py-2 text-center font-semibold">Cust</th>
                    <th className="px-3 py-2 text-center font-semibold">Bus</th>
                    <th className="px-3 py-2 text-center font-semibold">Comp</th>
                    <th className="px-3 py-2 text-center font-semibold">Soft</th>
                    <th className="px-3 py-2 text-center font-semibold">Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {topLOBs.map((l) => (
                    <tr key={l.lob} className="table-row">
                      <td className="px-3 py-2 font-medium text-slate-700">{l.lob}</td>
                      <td className="px-3 py-2 text-center text-slate-500">{l.total}</td>
                      <td className="px-3 py-2 text-center"><AccCell value={l.customerAccuracy} target={getTarget('customer_critical', activeProjectIdResolved)} /></td>
                      <td className="px-3 py-2 text-center"><AccCell value={l.businessAccuracy} target={getTarget('business_critical', activeProjectIdResolved)} /></td>
                      <td className="px-3 py-2 text-center"><AccCell value={l.complianceAccuracy} target={getTarget('compliance_critical', activeProjectIdResolved)} /></td>
                      <td className="px-3 py-2 text-center"><AccCell value={l.nonCritAccuracy} target={getTarget('soft_skills', activeProjectIdResolved)} /></td>
                      <td className="px-3 py-2 text-center font-bold tabular-nums text-slate-900">{l.avgScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Recent evaluations */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="section-title"><ClipboardList className="h-4 w-4 text-brand-600" /> Recent Evaluations</h3>
          <button onClick={() => navigate({ name: 'evaluations' })} className="btn-ghost text-xs">View all <ChevronRight className="h-3 w-3" /></button>
        </div>
        {recentEvals.length === 0 ? (
          <EmptyState title="No evaluations yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="px-3 py-2 text-left font-semibold">Agent</th>
                  <th className="px-3 py-2 text-left font-semibold">LOB</th>
                  <th className="px-3 py-2 text-left font-semibold">Task Type</th>
                  <th className="px-3 py-2 text-left font-semibold">Skill</th>
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-center font-semibold">Score</th>
                  <th className="px-3 py-2 text-center font-semibold">Result</th>
                </tr>
              </thead>
              <tbody>
                {recentEvals.map((ev) => (
                  <tr key={ev.id} onClick={() => navigate({ name: 'evaluation', id: ev.id })} className="table-row cursor-pointer">
                    <td className="px-3 py-2 font-medium text-slate-700">{ev.agent?.agent_name ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{ev.agent?.lob ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{ev.task_type ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{ev.main_skill ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-400">{fmtDateTime(ev.evaluation_date)}</td>
                    <td className="px-3 py-2 text-center"><ScoreBadge score={ev.call_score} passFail={ev.pass_fail} /></td>
                    <td className="px-3 py-2 text-center">
                      <span className={cls('badge', ev.pass_fail === 'Pass' ? 'badge-pass' : 'badge-fail')}>{ev.pass_fail}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function getWeekKey(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day2 = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day2}`;
}

function StatCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone: 'brand' | 'emerald' | 'amber' | 'rose' }) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-success-50 text-success-600',
    amber: 'bg-warning-50 text-warning-600',
    rose: 'bg-danger-50 text-danger-600',
  };
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <div className={cls('flex h-10 w-10 items-center justify-center rounded-lg', tones[tone])}>{icon}</div>
      </div>
      <div className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function AccuracyCard({ icon, label, detail, target }: { icon: React.ReactNode; label: string; detail: { accuracy: number; errors: number; evaluatedCalls: number }; target: number }) {
  const tone = getTargetTone(detail.accuracy, target);
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <div className={cls('flex h-10 w-10 items-center justify-center rounded-lg', toneBg(tone))}>{icon}</div>
        <span className={cls('rounded-full px-2 py-0.5 text-xs font-medium', toneBg(tone))}>Target: {target}%</span>
      </div>
      <div className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{detail.accuracy}%</div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xs text-slate-400">{detail.errors} Errors / {detail.evaluatedCalls} Evaluated Calls</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cls('h-full rounded-full transition-all duration-500', toneBar(tone))} style={{ width: `${detail.accuracy}%` }} />
      </div>
    </div>
  );
}

function AccCell({ value, target }: { value: number; target: number }) {
  const tone = getTargetTone(value, target);
  return <span className={cls('font-bold tabular-nums', tone === 'green' ? 'text-success-600' : tone === 'yellow' ? 'text-warning-600' : 'text-danger-600')}>{value}%</span>;
}

function CoachingRow({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'amber' | 'blue' | 'emerald' | 'slate' }) {
  const tones: Record<string, string> = {
    amber: 'bg-warning-50 text-warning-600',
    blue: 'bg-accent-50 text-accent-600',
    emerald: 'bg-success-50 text-success-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50 transition">
      <div className={cls('flex h-8 w-8 items-center justify-center rounded-lg', tones[tone])}>{icon}</div>
      <span className="flex-1 text-sm text-slate-600">{label}</span>
      <span className="text-lg font-bold tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Award, TrendingUp, ShieldCheck, Briefcase, Scale, Sparkles, ChevronRight, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { navigate } from '../lib/router';
import { cls, fmtDuration, downloadCSV } from '../lib/utils';
import { computeScore, computeAccuracyForEvaluations, TASK_TYPES } from '../lib/scorecard';
import { PageHeader, ScoreBadge, LoadingState, ErrorState, EmptyState } from '../components/ui';
import { useL } from '../lib/labels';
import type { Evaluation, Agent, Project, FormConfig } from '../types';

type PerfRow = Evaluation & {
  agent?: Pick<Agent, 'id' | 'agent_name' | 'lob' | 'team_leader' | 'coach_name' | 'manager_name' | 'project_id'> | null;
  project?: Pick<Project, 'id' | 'name'> | null;
};

type AgentStat = {
  agentId: string;
  agentName: string;
  coachName: string;
  teamLeader: string;
  projectName: string;
  lob: string;
  taskType: string;
  evaluatedTransactions: number;
  customerCritical: number;
  businessCritical: number;
  complianceCritical: number;
  nonCritical: number;
  avgScore: number;
};

export function AgentPerformancePage() {
  const { activeProjectId, projects } = useAuth();
  const L = useL();
  const [rows, setRows] = useState<PerfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterProject, setFilterProject] = useState('');
  const [filterLOB, setFilterLOB] = useState('');
  const [filterTask, setFilterTask] = useState('');

  const availableLOBs = useMemo(() => {
    const proj = projects.find((p) => p.id === filterProject);
    if (proj?.lob_config && proj.lob_config.length > 0) return proj.lob_config;
    const set = new Set<string>();
    rows.forEach((r) => { if (r.agent?.lob) set.add(r.agent.lob); });
    return Array.from(set).sort();
  }, [projects, filterProject, rows]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      let q = supabase
        .from('evaluations')
        .select('*, agent:agents(id, agent_name, lob, team_leader, coach_name, manager_name, project_id), project:projects(id, name)')
        .order('created_at', { ascending: false })
        .limit(1000);
      const pid = filterProject || activeProjectId;
      if (pid) q = q.eq('project_id', pid);
      const { data, error } = await q;
      if (!active) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as PerfRow[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [activeProjectId, filterProject]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterLOB && r.agent?.lob !== filterLOB) return false;
      if (filterTask && r.task_type !== filterTask) return false;
      return true;
    });
  }, [rows, filterLOB, filterTask]);

  const agentStats = useMemo<AgentStat[]>(() => {
    const map = new Map<string, AgentStat>();
    for (const r of filteredRows) {
      if (!r.agent_id || !r.agent) continue;
      const key = r.agent_id;
      const cur = map.get(key) ?? {
        agentId: key,
        agentName: r.agent.agent_name,
        coachName: r.agent.coach_name ?? '—',
        teamLeader: r.agent.team_leader ?? '—',
        projectName: r.project?.name ?? '—',
        lob: r.agent.lob ?? '—',
        taskType: r.task_type ?? '—',
        evaluatedTransactions: 0,
        customerCritical: 0,
        businessCritical: 0,
        complianceCritical: 0,
        nonCritical: 0,
        avgScore: 0,
      };
      cur.evaluatedTransactions += 1;
      const config = (r.form_config ?? null) as FormConfig | null;
      const score = computeScore(r.checklist ?? [], config ?? undefined);
      score.categoryAccuracy.forEach((ca) => {
        if (ca.key === 'Customer Critical') cur.customerCritical = Math.round(((cur.customerCritical * (cur.evaluatedTransactions - 1)) + ca.accuracy) / cur.evaluatedTransactions);
        if (ca.key === 'Business Critical') cur.businessCritical = Math.round(((cur.businessCritical * (cur.evaluatedTransactions - 1)) + ca.accuracy) / cur.evaluatedTransactions);
        if (ca.key === 'Compliance Critical') cur.complianceCritical = Math.round(((cur.complianceCritical * (cur.evaluatedTransactions - 1)) + ca.accuracy) / cur.evaluatedTransactions);
        if (!ca.critical) cur.nonCritical = Math.round(((cur.nonCritical * (cur.evaluatedTransactions - 1)) + ca.accuracy) / cur.evaluatedTransactions);
      });
      cur.avgScore = Math.round(((cur.avgScore * (cur.evaluatedTransactions - 1)) + (r.call_score ?? 0)) / cur.evaluatedTransactions);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.avgScore - a.avgScore);
  }, [filteredRows]);

  if (loading) return <LoadingState label="Loading agent performance…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <PageHeader title={L('page.agent_performance', 'Agent Performance')} subtitle="Individual agent KPIs across evaluations"
        actions={
          <button onClick={() => downloadCSV('agent_performance.csv', agentStats.map((a) => ({
            agent_name: a.agentName, coach: a.coachName, team_leader: a.teamLeader,
            project: a.projectName, lob: a.lob, evaluated_transactions: a.evaluatedTransactions,
            task_type: a.taskType, customer_critical_pct: a.customerCritical, business_critical_pct: a.businessCritical,
            compliance_pct: a.complianceCritical, non_critical_pct: a.nonCritical, avg_score: a.avgScore,
          })))} disabled={agentStats.length === 0} className="btn-secondary">
            <Download className="h-4 w-4" /> Export
          </button>
        }
      />

      {/* Filters */}
      <div className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
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
        <div className="flex items-end">
          <button onClick={() => { setFilterProject(''); setFilterLOB(''); setFilterTask(''); }} className="btn-ghost text-xs">Clear Filters</button>
        </div>
      </div>

      {agentStats.length === 0 ? (
        <EmptyState title="No data" subtitle="No evaluations found for the selected filters" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-3 py-2">Agent Name</th>
                <th className="px-3 py-2">Coach</th>
                <th className="px-3 py-2">Team Leader</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">LOB</th>
                <th className="px-3 py-2 text-center">Evals</th>
                <th className="px-3 py-2 text-center">Task Type</th>
                <th className="px-3 py-2 text-center">Customer Crit %</th>
                <th className="px-3 py-2 text-center">Business Crit %</th>
                <th className="px-3 py-2 text-center">Compliance %</th>
                <th className="px-3 py-2 text-center">Non-Crit %</th>
                <th className="px-3 py-2 text-center">Avg Score</th>
              </tr>
            </thead>
            <tbody>
              {agentStats.map((a) => (
                <tr key={a.agentId} className="table-row">
                  <td className="px-3 py-2 font-medium text-slate-700">{a.agentName}</td>
                  <td className="px-3 py-2 text-slate-600">{a.coachName}</td>
                  <td className="px-3 py-2 text-slate-600">{a.teamLeader}</td>
                  <td className="px-3 py-2 text-slate-600">{a.projectName}</td>
                  <td className="px-3 py-2 text-slate-600">{a.lob}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-slate-700">{a.evaluatedTransactions}</td>
                  <td className="px-3 py-2 text-center text-slate-600">{a.taskType}</td>
                  <td className="px-3 py-2 text-center"><AccBadge value={a.customerCritical} /></td>
                  <td className="px-3 py-2 text-center"><AccBadge value={a.businessCritical} /></td>
                  <td className="px-3 py-2 text-center"><AccBadge value={a.complianceCritical} /></td>
                  <td className="px-3 py-2 text-center"><AccBadge value={a.nonCritical} /></td>
                  <td className="px-3 py-2 text-center"><ScoreBadge score={a.avgScore} passFail={a.avgScore >= 75 ? 'Pass' : 'Failed'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AccBadge({ value }: { value: number }) {
  const tone = value >= 90 ? 'text-emerald-600 bg-emerald-50' : value >= 75 ? 'text-amber-600 bg-amber-50' : 'text-rose-600 bg-rose-50';
  return <span className={cls('inline-block rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums', tone)}>{value}%</span>;
}

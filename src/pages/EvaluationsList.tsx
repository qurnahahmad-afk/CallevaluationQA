import { useEffect, useMemo, useState } from 'react';
import { Search, Filter, ChevronRight, X, ClipboardList, Download, FileSpreadsheet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useL } from '../lib/labels';
import { navigate } from '../lib/router';
import { cls, fmtDate, fmtDateTime, downloadExcel } from '../lib/utils';
import { TASK_TYPES, TRANSACTION_TYPES } from '../lib/scorecard';
import { useAgents, useProjects } from '../lib/hooks';
import { PageHeader, ScoreBadge, LoadingState, ErrorState, EmptyState } from '../components/ui';
import type { Evaluation, Agent, Project } from '../types';

type ListRow = Evaluation & {
  agent?: Pick<Agent, 'id' | 'agent_name' | 'lob' | 'team_leader' | 'project_id'> | null;
  project?: Pick<Project, 'id' | 'name'> | null;
};

export function EvaluationsList() {
  const { activeProjectId, profile, hasPermission } = useAuth();
  const L = useL();
  const { agents } = useAgents(activeProjectId);
  const { projects } = useProjects();
  const isQualityOnly = (profile?.role === 'quality' || profile?.role === 'quality_expert') && !hasPermission('manage_users');

  const [rows, setRows] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterTask, setFilterTask] = useState('');
  const [filterTransaction, setFilterTransaction] = useState('');
  const [filterCoach, setFilterCoach] = useState('');
  const [filterTeamLeader, setFilterTeamLeader] = useState('');
  const [filterLOB, setFilterLOB] = useState('');
  const [filterSkill, setFilterSkill] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      let q = supabase
        .from('evaluations')
        .select('*, agent:agents(id, agent_name, lob, team_leader, project_id), project:projects(id, name), coach_profile:profiles(id, full_name, email)')
        .order('created_at', { ascending: false })
        .limit(500);
      if (activeProjectId) q = q.eq('project_id', activeProjectId);
      if (isQualityOnly && profile) q = q.eq('coach_user_id', profile.id);
      const { data, error } = await q;
      if (!active) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as ListRow[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [activeProjectId, isQualityOnly, profile]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          (r.agent?.agent_name ?? '').toLowerCase().includes(q) ||
          (r.coach_name ?? '').toLowerCase().includes(q) ||
          (r.transaction_link ?? '').toLowerCase().includes(q) ||
          (r.caller_number ?? '').toLowerCase().includes(q) ||
          (r.main_skill ?? '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filterAgent && r.agent_id !== filterAgent) return false;
      if (filterProject && r.project_id !== filterProject) return false;
      if (filterTask && r.task_type !== filterTask) return false;
      if (filterTransaction && r.transaction_type !== filterTransaction) return false;
      if (filterLOB && (r.agent?.lob ?? '') !== filterLOB) return false;
      if (filterSkill && (r.main_skill ?? '') !== filterSkill) return false;
      if (filterCoach && (r.coach_name ?? '').toLowerCase() !== filterCoach.toLowerCase()) return false;
      if (filterTeamLeader && (r.agent?.team_leader ?? '').toLowerCase() !== filterTeamLeader.toLowerCase()) return false;
      if (dateFrom && (r.evaluation_date ?? '') < dateFrom) return false;
      if (dateTo && (r.evaluation_date ?? '') > dateTo) return false;
      return true;
    });
  }, [rows, search, filterAgent, filterProject, filterTask, filterTransaction, filterCoach, filterTeamLeader, dateFrom, dateTo]);

  const activeFilterCount = [filterAgent, filterProject, filterTask, filterTransaction, filterCoach, filterTeamLeader, filterLOB, filterSkill, dateFrom, dateTo].filter(Boolean).length;

  const clearFilters = () => {
    setFilterAgent(''); setFilterProject(''); setFilterTask(''); setFilterTransaction('');
    setFilterCoach(''); setFilterTeamLeader(''); setFilterLOB(''); setFilterSkill(''); setDateFrom(''); setDateTo('');
  };

  if (loading) return <LoadingState label="Loading evaluations…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={L('page.evaluations', 'Evaluations')}
        subtitle={`${filtered.length} of ${rows.length} evaluations`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => navigate({ name: 'new' })} className="btn-primary">
              <ClipboardList className="h-4 w-4" /> {L('button.new_evaluation', 'New Evaluation')}
            </button>
            <button onClick={() => downloadExcel('evaluations.xls', filtered.map((r) => ({ Agent: r.agent?.agent_name ?? '', Project: r.project?.name ?? '', LOB: r.agent?.lob ?? '', Skill: r.main_skill ?? '', Task_Type: r.task_type ?? '', Transaction_Type: r.transaction_type ?? '', Coach: r.coach_name ?? '', Evaluation_Date: r.evaluation_date ?? '', Call_Score: r.call_score ?? '', Pass_Fail: r.pass_fail ?? '' })))} disabled={filtered.length === 0} className="btn-secondary">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </button>
          </div>
        }
      />

      {/* Search + filter toggle */}
      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agent, coach, ticket, case ID…"
              className="input pl-9"
            />
          </div>
          <button onClick={() => setShowFilters((s) => !s)} className={cls('btn-secondary', showFilters && 'ring-2 ring-brand-200')}>
            <Filter className="h-4 w-4" /> Filters
            {activeFilterCount > 0 && <span className="badge-brand">{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="btn-ghost text-xs">
              <X className="h-3 w-3" /> {L('button.clear_filters', 'Clear')}
            </button>
          )}
        </div>

        {showFilters && (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">{L('column.agent', 'Agent')}</label>
              <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)} className="input">
                <option value="">All agents</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.agent_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{L('column.project', 'Project')}</label>
              <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="input">
                <option value="">All projects</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
              <label className="label">{L('column.transaction_type', 'Transaction Type')}</label>
              <select value={filterTransaction} onChange={(e) => setFilterTransaction(e.target.value)} className="input">
                <option value="">All</option>
                {TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">LOB</label>
              <input value={filterLOB} onChange={(e) => setFilterLOB(e.target.value)} placeholder="Filter by LOB…" className="input" />
            </div>
            <div>
              <label className="label">Skill</label>
              <input value={filterSkill} onChange={(e) => setFilterSkill(e.target.value)} placeholder="Filter by skill…" className="input" />
            </div>
            <div>
              <label className="label">{L('column.coach', 'Coach Name')}</label>
              <input value={filterCoach} onChange={(e) => setFilterCoach(e.target.value)} placeholder="Filter by coach…" className="input" />
            </div>
            <div>
              <label className="label">{L('column.team_leader', 'Team Leader')}</label>
              <input value={filterTeamLeader} onChange={(e) => setFilterTeamLeader(e.target.value)} placeholder="Filter by team leader…" className="input" />
            </div>
            <div>
              <label className="label">Date From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Date To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input" />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" />}
          title="No evaluations found"
          subtitle="Try adjusting your filters or create a new evaluation"
          action={<button onClick={() => navigate({ name: 'new' })} className="btn-primary">New Evaluation</button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="px-4 py-3 font-semibold">{L('column.agent', 'Agent')}</th>
                  <th className="px-4 py-3 font-semibold">LOB</th>
                  <th className="px-4 py-3 font-semibold">{L('column.date', 'Date')}</th>
                  <th className="px-4 py-3 font-semibold">{L('column.project', 'Project')}</th>
                  <th className="px-4 py-3 font-semibold">Task</th>
                  <th className="px-4 py-3 font-semibold">Skill</th>
                  <th className="px-4 py-3 font-semibold">{L('column.transaction_type', 'Transaction')}</th>
                  <th className="px-4 py-3 font-semibold">{L('column.coach', 'Coach')}</th>
                  <th className="px-4 py-3 font-semibold">{L('column.score', 'Score')}</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => navigate({ name: 'evaluation', id: r.id })}
                    className="table-row cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700">{r.agent?.agent_name ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.agent?.lob ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(r.evaluation_date)}</td>
                    <td className="px-4 py-3 text-slate-600">{r.project?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.task_type ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.main_skill ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.transaction_type ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.coach_name ?? '—'}</td>
                    <td className="px-4 py-3"><ScoreBadge score={r.call_score} passFail={r.pass_fail} /></td>
                    <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-slate-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

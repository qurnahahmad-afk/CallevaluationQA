import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Download, Columns, Table, ChevronDown, ChevronRight, CheckSquare, Square,
  FileSpreadsheet, FileText, FileType,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { cls, fmtDate, fmtDateTime, fmtCallDuration, downloadCSV } from '../lib/utils';
import { computeScore, computeAccuracyForEvaluations, TASK_TYPES } from '../lib/scorecard';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui';
import { useL } from '../lib/labels';
import type { Evaluation, Agent, Project, Profile, FormConfig } from '../types';

type ReportRow = Evaluation & {
  agent?: Pick<Agent, 'id' | 'agent_name' | 'lob' | 'team_leader' | 'coach_name' | 'project_id'> | null;
  project?: Pick<Project, 'id' | 'name'> | null;
  coach_profile?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};

type ColumnDef = { key: string; label: string; group: string; default: boolean };

const COLUMNS: ColumnDef[] = [
  { key: 'evaluation_date', label: 'Evaluation Date', group: 'Call Info', default: true },
  { key: 'agent_name', label: 'Agent Name', group: 'Call Info', default: true },
  { key: 'agent_lob', label: 'LOB', group: 'Call Info', default: true },
  { key: 'team_leader', label: 'Team Leader', group: 'Call Info', default: false },
  { key: 'coach_name', label: 'Coach', group: 'Call Info', default: true },
  { key: 'project_name', label: 'Project', group: 'Call Info', default: true },
  { key: 'call_score', label: 'Score', group: 'Call Info', default: true },
  { key: 'pass_fail', label: 'Pass/Fail', group: 'Call Info', default: true },
  { key: 'task_type', label: 'Task Type', group: 'Call Info', default: false },
  { key: 'transaction_type', label: 'Transaction Type', group: 'Call Info', default: false },
  { key: 'call_duration', label: 'Call Duration', group: 'Call Info', default: false },
  { key: 'email_date_time', label: 'Email Date', group: 'Call Info', default: false },
  { key: 'transaction_link', label: 'Transaction Link', group: 'Call Info', default: false },
  { key: 'caller_number', label: 'Case ID', group: 'Call Info', default: false },
  { key: 'main_skill', label: 'Main Skill', group: 'Call Info', default: false },
  { key: 'mistake_type', label: 'Mistake Type', group: 'Call Info', default: false },
  { key: 'customer_critical_accuracy', label: 'Customer Critical Accuracy %', group: 'Accuracy', default: false },
  { key: 'business_critical_accuracy', label: 'Business Critical Accuracy %', group: 'Accuracy', default: false },
  { key: 'compliance_critical_accuracy', label: 'Compliance Critical Accuracy %', group: 'Accuracy', default: false },
  { key: 'non_critical_accuracy', label: 'Non-Critical Accuracy %', group: 'Accuracy', default: false },
  { key: 'dsat', label: 'DSAT', group: 'Diagnostics', default: false },
  { key: 'dsat_reason_l1', label: 'DSAT L1', group: 'Diagnostics', default: false },
  { key: 'solved_customer_issue', label: 'FCR Solved', group: 'Diagnostics', default: false },
  { key: 'repeated_interaction', label: 'Repeated', group: 'Diagnostics', default: false },
  { key: 'agent_follow_service_mapping', label: 'Service Mapping', group: 'Diagnostics', default: false },
  { key: 'valid_hold', label: 'Valid Hold', group: 'Diagnostics', default: false },
  { key: 'valid_aht', label: 'Valid AHT', group: 'Diagnostics', default: false },
  { key: 'core_issue_l1', label: 'Core Issue L1', group: 'Diagnostics', default: false },
  { key: 'core_issue_l2', label: 'Core Issue L2', group: 'Diagnostics', default: false },
  { key: 'core_issue_l3', label: 'Core Issue L3', group: 'Diagnostics', default: false },
  { key: 'customer_verbatim', label: 'Customer Verbatim', group: 'Narratives', default: false },
  { key: 'call_summary', label: 'Call Summary', group: 'Narratives', default: false },
  { key: 'comment', label: 'Quality Comments', group: 'Narratives', default: false },
  { key: 'feedback_to_agent', label: 'Feedback to Agent', group: 'Narratives', default: false },
  { key: 'evaluation_duration_seconds', label: 'Eval Duration', group: 'Meta', default: false },
  { key: 'created_at', label: 'Created At', group: 'Meta', default: false },
];

const GROUPS = ['Call Info', 'Accuracy', 'Diagnostics', 'Narratives', 'Meta'];

export function ReportsPage() {
  const { activeProjectId, projects } = useAuth();
  const L = useL();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set(COLUMNS.filter((c) => c.default).map((c) => c.key)));
  const [groupBy, setGroupBy] = useState('');
  const [summarize, setSummarize] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Filters
  const [filterProject, setFilterProject] = useState('');
  const [filterLOB, setFilterLOB] = useState('');
  const [filterTask, setFilterTask] = useState('');
  const [dateFilter, setDateFilter] = useState<'day' | 'month' | 'year'>('day');
  const [dateValue, setDateValue] = useState('');

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
      let q = supabase
        .from('evaluations')
        .select('*, agent:agents(id, agent_name, lob, team_leader, coach_name, project_id), project:projects(id, name), coach_profile:profiles(id, full_name, email)')
        .order('created_at', { ascending: false })
        .limit(1000);
      const pid = filterProject || activeProjectId;
      if (pid) q = q.eq('project_id', pid);
      const { data, error } = await q;
      if (!active) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as ReportRow[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [activeProjectId, filterProject]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterLOB && r.agent?.lob !== filterLOB) return false;
      if (filterTask && r.task_type !== filterTask) return false;
      if (dateValue && r.evaluation_date) {
        const evDate = r.evaluation_date.slice(0, 10);
        if (dateFilter === 'day' && evDate !== dateValue) return false;
        if (dateFilter === 'month' && evDate.slice(0, 7) !== dateValue) return false;
        if (dateFilter === 'year' && evDate.slice(0, 4) !== dateValue) return false;
      }
      return true;
    });
  }, [rows, filterLOB, filterTask, dateFilter, dateValue]);

  const flattenRow = (r: ReportRow): Record<string, unknown> => {
    const flat: Record<string, unknown> = {};
    const config = (r.form_config ?? null) as FormConfig | null;
    const score = computeScore(r.checklist ?? [], config ?? undefined);
    const accMap: Record<string, number> = {};
    score.categoryAccuracy.forEach((ca) => {
      if (ca.key === 'Customer Critical') accMap['customer_critical_accuracy'] = ca.accuracy;
      if (ca.key === 'Business Critical') accMap['business_critical_accuracy'] = ca.accuracy;
      if (ca.key === 'Compliance Critical') accMap['compliance_critical_accuracy'] = ca.accuracy;
      if (!ca.critical) accMap['non_critical_accuracy'] = ca.accuracy;
    });
    for (const col of COLUMNS) {
      switch (col.key) {
        case 'agent_name': flat[col.key] = r.agent?.agent_name ?? ''; break;
        case 'agent_lob': flat[col.key] = r.agent?.lob ?? ''; break;
        case 'team_leader': flat[col.key] = r.agent?.team_leader ?? ''; break;
        case 'coach_name': flat[col.key] = r.coach_name ?? r.coach_profile?.full_name ?? ''; break;
        case 'project_name': flat[col.key] = r.project?.name ?? ''; break;
        case 'customer_critical_accuracy':
        case 'business_critical_accuracy':
        case 'compliance_critical_accuracy':
        case 'non_critical_accuracy':
          flat[col.key] = accMap[col.key] ?? ''; break;
        case 'call_duration': flat[col.key] = fmtCallDuration(r.call_duration); break;
        case 'email_date_time': flat[col.key] = r.email_date_time ? fmtDate(r.email_date_time) : ''; break;
        default: flat[col.key] = (r as Record<string, unknown>)[col.key] ?? '';
      }
    }
    return flat;
  };

  const flatRows = useMemo(() => filteredRows.map(flattenRow), [filteredRows]);

  const reportData = useMemo(() => {
    if (!summarize || !groupBy) return flatRows;
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of flatRows) {
      const key = String(row[groupBy] ?? '—');
      const arr = groups.get(key) ?? [];
      arr.push(row);
      groups.set(key, arr);
    }
    const result: Record<string, unknown>[] = [];
    for (const [key, groupRows] of groups) {
      const scores = groupRows.map((r) => Number(r.call_score) || 0);
      const passed = groupRows.filter((r) => r.pass_fail === 'Pass').length;
      result.push({
        [groupBy]: key,
        count: groupRows.length,
        avg_score: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        pass_count: passed,
        fail_count: groupRows.length - passed,
        pass_rate: groupRows.length > 0 ? Math.round((passed / groupRows.length) * 100) : 0,
      });
    }
    return result;
  }, [flatRows, summarize, groupBy]);

  const previewRows = useMemo(() => reportData.slice(0, 50), [reportData]);

  const visibleColumns = useMemo(() => {
    if (summarize && groupBy) {
      return [
        { key: groupBy, label: COLUMNS.find((c) => c.key === groupBy)?.label ?? groupBy },
        { key: 'count', label: 'Count' },
        { key: 'avg_score', label: 'Avg Score' },
        { key: 'pass_count', label: 'Pass' },
        { key: 'fail_count', label: 'Fail' },
        { key: 'pass_rate', label: 'Pass Rate %' },
      ];
    }
    return COLUMNS.filter((c) => selectedCols.has(c.key));
  }, [selectedCols, summarize, groupBy]);

  const toggleColumn = (key: string) => {
    setSelectedCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const buildExportRows = () => {
    return reportData.map((r) => {
      const out: Record<string, unknown> = {};
      for (const col of visibleColumns) {
        out[col.label] = r[col.key] ?? '';
      }
      return out;
    });
  };

  const handleExportCSV = () => {
    downloadCSV('evaluation_report.csv', buildExportRows());
  };

  const handleExportExcel = () => {
    // Excel-compatible: tab-separated values with .xls extension
    const exportRows = buildExportRows();
    if (exportRows.length === 0) return;
    const headers = Object.keys(exportRows[0]);
    const lines = [headers.join('\t')];
    for (const row of exportRows) {
      lines.push(headers.map((h) => String(row[h] ?? '').replace(/\t/g, ' ')).join('\t'));
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'evaluation_report.xls';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    const exportRows = buildExportRows();
    if (exportRows.length === 0) return;
    const headers = Object.keys(exportRows[0]);
    const win = window.open('', '_blank');
    if (!win) return;
    const rowsHtml = exportRows.map((row) =>
      `<tr>${headers.map((h) => `<td style="border:1px solid #ddd;padding:4px 8px;font-size:11px;">${String(row[h] ?? '').replace(/</g, '&lt;')}</td>`).join('')}</tr>`
    ).join('');
    win.document.write(`
      <html><head><title>Evaluation Report</title>
      <style>body{font-family:Arial,sans-serif;margin:20px}h1{font-size:18px}table{border-collapse:collapse;width:100%}th{background:#f1f5f9;text-align:left;font-size:11px;padding:4px 8px;border:1px solid #ddd}</style>
      </head><body>
      <h1>Evaluation Report</h1>
      <p>Generated: ${new Date().toLocaleString()} · ${exportRows.length} rows</p>
      <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>
      </body></html>`);
    win.document.close();
    win.print();
  };

  if (loading) return <LoadingState label="Loading report data…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={L('page.reports', 'Reports')}
        subtitle={`${reportData.length} rows`}
        actions={
          <div className="flex gap-2">
            <button onClick={handleExportCSV} disabled={reportData.length === 0} className="btn-ghost text-sm">
              <FileText className="h-4 w-4" /> CSV
            </button>
            <button onClick={handleExportExcel} disabled={reportData.length === 0} className="btn-ghost text-sm">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </button>
            <button onClick={handleExportPDF} disabled={reportData.length === 0} className="btn-primary text-sm">
              <FileType className="h-4 w-4" /> PDF
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-6">
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
        <div className="flex items-end">
          <button onClick={() => { setFilterProject(''); setFilterLOB(''); setFilterTask(''); setDateValue(''); }} className="btn-ghost text-xs">Clear Filters</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Column selector */}
        <div className="card p-5 lg:col-span-1">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Columns className="h-4 w-4 text-brand-600" /> Column Selector
          </h3>
          <div className="space-y-2">
            {GROUPS.map((group) => {
              const groupCols = COLUMNS.filter((c) => c.group === group);
              const collapsed = collapsedGroups.has(group);
              return (
                <div key={group}>
                  <button onClick={() => toggleGroup(group)} className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {group}
                  </button>
                  {!collapsed && (
                    <div className="mt-1 space-y-1 pl-4">
                      {groupCols.map((col) => (
                        <button
                          key={col.key}
                          onClick={() => toggleColumn(col.key)}
                          className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50"
                        >
                          {selectedCols.has(col.key) ? <CheckSquare className="h-3.5 w-3.5 text-brand-600" /> : <Square className="h-3.5 w-3.5 text-slate-300" />}
                          <span className={cls('text-slate-600', !selectedCols.has(col.key) && 'text-slate-400')}>{L(`column.${col.key}`, col.label)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Group & summarize + preview */}
        <div className="space-y-4 lg:col-span-2">
          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <BarChart3 className="h-4 w-4 text-brand-600" /> Group & Summarize
            </h3>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="label">Group By</label>
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="input">
                  <option value="">No grouping</option>
                  {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" checked={summarize} onChange={(e) => setSummarize(e.target.checked)} className="h-4 w-4 rounded" />
                <span className="text-slate-600">Summarize (count, avg, pass rate)</span>
              </label>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Table className="h-4 w-4 text-brand-600" /> Data Preview
              <span className="text-xs font-normal text-slate-400">(first 50 rows)</span>
            </h3>
            {previewRows.length === 0 ? (
              <EmptyState title="No data" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-header">
                      {visibleColumns.map((col) => (
                        <th key={col.key} className="px-3 py-2 font-semibold whitespace-nowrap">{L(`column.${col.key}`, col.label)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="table-row">
                        {visibleColumns.map((col) => {
                          const val = row[col.key];
                          const display = col.key === 'evaluation_date' || col.key === 'created_at' || col.key === 'email_date_time'
                            ? fmtDate(String(val ?? ''))
                            : col.key === 'call_duration' ? fmtCallDuration(String(val ?? '')) : String(val ?? '—');
                          return (
                            <td key={col.key} className="px-3 py-2 whitespace-nowrap text-slate-600">
                              {col.key === 'pass_fail' ? (
                                val === 'Pass' ? <span className="badge-pass">Pass</span> : <span className="badge-fail">Failed</span>
                              ) : display}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

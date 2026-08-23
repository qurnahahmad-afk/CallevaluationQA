import { useMemo, useRef, useState } from 'react';
import {
  Upload, Search, Download, ToggleLeft, ToggleRight, Users, FileSpreadsheet,
  CheckCircle2, XCircle, AlertTriangle, Loader2, ArrowLeft, X, FileDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { navigate } from '../lib/router';
import { logAudit } from '../lib/audit';
import { useAuth } from '../lib/auth';
import { cls } from '../lib/utils';
import { useAgents, useProjects } from '../lib/hooks';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui';
import { useL } from '../lib/labels';
import type { Agent } from '../types';

type ParsedRow = {
  rowIndex: number;
  agent_name: string;
  email: string;
  mena_me_code: string;
  project_name: string;
  lob: string;
  coach_name: string;
  team_leader: string;
  manager_name: string;
  errors: string[];
};

type ImportSummary = {
  total: number;
  success: number;
  updated: number;
  failed: number;
  duplicates: number;
  failures: { row: number; name: string; reason: string }[];
  allRows: { row: number; name: string; email: string; code: string; status: string; reason: string }[];
};

const TEMPLATE_HEADERS = [
  'Full Name', 'Email Address', 'Mename Code', 'Project Name',
  'LOB Name', 'Coach Name', 'Team Leader Name', 'Manager Name',
];

function normalizeKey(k: string): string {
  return k.toLowerCase().trim().replace(/[\s_]+/g, '');
}

function findVal(row: Record<string, unknown>, candidates: string[]): string {
  const lowerMap: Record<string, string> = {};
  for (const k of Object.keys(row)) lowerMap[normalizeKey(k)] = k;
  for (const c of candidates) {
    const nk = normalizeKey(c);
    if (lowerMap[nk]) {
      const v = row[lowerMap[nk]];
      return v != null && String(v).trim() !== '' ? String(v).trim() : '';
    }
  }
  return '';
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function AgentsPage() {
  const { activeProjectId } = useAuth();
  const L = useL();
  const { agents, loading, error, setAgents } = useAgents(activeProjectId);
  const { projects } = useProjects();

  const [search, setSearch] = useState('');
  const [filterLOB, setFilterLOB] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const lobs = useMemo(() => {
    const set = new Set<string>();
    agents.forEach((a) => { if (a.lob) set.add(a.lob); });
    return Array.from(set).sort();
  }, [agents]);

  const filtered = useMemo(() => {
    return agents.filter((a) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          a.agent_name.toLowerCase().includes(q) ||
          (a.email ?? '').toLowerCase().includes(q) ||
          (a.mena_me_code ?? '').toLowerCase().includes(q) ||
          (a.team_leader ?? '').toLowerCase().includes(q) ||
          (a.coach_name ?? '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filterLOB && a.lob !== filterLOB) return false;
      if (filterActive === 'active' && !a.active) return false;
      if (filterActive === 'inactive' && a.active) return false;
      return true;
    });
  }, [agents, search, filterLOB, filterActive]);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Agents');
    XLSX.writeFile(wb, 'agent_upload_template.xlsx');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setSummary(null);
    setParseError(null);
    setLastFile(file);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      if (rows.length === 0) {
        setParseError('The uploaded file is empty or has no data rows.');
        setImporting(false);
        if (fileRef.current) fileRef.current.value = '';
        return;
      }

      // Parse + validate
      const parsed: ParsedRow[] = rows.map((row, idx) => {
        const agent_name = findVal(row, ['Full Name', 'Agent Name', 'Name']);
        const email = findVal(row, ['Email Address', 'Email']);
        const mena_me_code = findVal(row, ['Mename Code', 'MENA Code', 'MENA ME Code', 'Code', 'Employee Code']);
        const project_name = findVal(row, ['Project Name', 'Project']);
        const lob = findVal(row, ['LOB Name', 'LOB', 'Line of Business']);
        const coach_name = findVal(row, ['Coach Name', 'Coach', 'QA']);
        const team_leader = findVal(row, ['Team Leader Name', 'Team Leader', 'TeamLeader']);
        const manager_name = findVal(row, ['Manager Name', 'Manager']);
        const errors: string[] = [];
        if (!agent_name) errors.push('Missing Full Name');
        if (!email && !mena_me_code) errors.push('Missing Email and Mename Code (at least one required)');
        if (email && !isValidEmail(email)) errors.push('Invalid email format');
        if (!project_name) errors.push('Missing Project Name');
        if (!lob) errors.push('Missing LOB Name');

        return {
          rowIndex: idx + 2,
          agent_name, email, mena_me_code, project_name, lob,
          coach_name, team_leader, manager_name,
          errors,
        };
      });

      // Check duplicates within file — by Full Name + Email combination
      const nameEmailSeen: Record<string, number> = {};
      let duplicateCount = 0;
      for (const r of parsed) {
        if (r.agent_name && r.email) {
          const key = `${r.agent_name.toLowerCase().trim()}||${r.email.toLowerCase().trim()}`;
          if (nameEmailSeen[key] !== undefined) {
            r.errors.push(`Duplicate Full Name + Email (row ${nameEmailSeen[key]})`);
            duplicateCount++;
          } else {
            nameEmailSeen[key] = r.rowIndex;
          }
        }
      }

      const validRows = parsed.filter((r) => r.errors.length === 0);
      const failedRows = parsed.filter((r) => r.errors.length > 0);

      // Build project name → id map
      const projectNameMap: Record<string, string> = {};
      for (const p of projects) projectNameMap[p.name.toLowerCase()] = p.id;

      // Validate project names
      for (const r of validRows) {
        const pid = projectNameMap[r.project_name.toLowerCase()];
        if (!pid) r.errors.push(`Project "${r.project_name}" not found`);
      }

      const finalValid = validRows.filter((r) => r.errors.length === 0);
      const finalFailed = [...failedRows, ...validRows.filter((r) => r.errors.length > 0)];

      // Fetch existing agents to determine updates vs new — match by Full Name
      const { data: existingAgents } = await supabase
        .from('agents')
        .select('id, agent_name, email, mena_me_code');

      const existingAgentsList = (existingAgents ?? []) as Pick<Agent, 'id' | 'agent_name' | 'email' | 'mena_me_code'>[];
      const existingByNameEmail: Record<string, Pick<Agent, 'id' | 'agent_name' | 'email' | 'mena_me_code'>> = {};
      for (const a of existingAgentsList) {
        if (a.agent_name && a.email) {
          const key = `${a.agent_name.toLowerCase().trim()}||${a.email.toLowerCase().trim()}`;
          existingByNameEmail[key] = a;
        }
      }

      let successCount = 0;
      let updateCount = 0;
      const allRowStatuses: { row: number; name: string; email: string; code: string; status: string; reason: string }[] = [];

      // Process each valid row
      for (const r of finalValid) {
        const projectId = projectNameMap[r.project_name.toLowerCase()];
        const payload = {
          agent_name: r.agent_name,
          email: r.email || null,
          mena_me_code: r.mena_me_code || null,
          project_id: projectId,
          lob: r.lob,
          coach_name: r.coach_name || null,
          team_leader: r.team_leader || null,
          manager_name: r.manager_name || null,
          active: true,
        };

        const matchKey = r.agent_name && r.email
          ? `${r.agent_name.toLowerCase().trim()}||${r.email.toLowerCase().trim()}`
          : '';
        const existing = matchKey ? existingByNameEmail[matchKey] : null;

        const isMenaCodeConstraintError = (msg: string) =>
          /mena_me_code/i.test(msg) && /unique/i.test(msg);

        if (existing) {
          let { error } = await supabase.from('agents').update(payload).eq('id', existing.id);
          if (error && isMenaCodeConstraintError(error.message)) {
            const payloadNoCode = { ...payload, mena_me_code: null };
            error = (await supabase.from('agents').update(payloadNoCode).eq('id', existing.id)).error;
          }
          if (error) {
            finalFailed.push({ ...r, errors: [...r.errors, error.message] });
            allRowStatuses.push({ row: r.rowIndex, name: r.agent_name, email: r.email, code: r.mena_me_code, status: 'Failed', reason: error.message });
          } else {
            updateCount++;
            successCount++;
            allRowStatuses.push({ row: r.rowIndex, name: r.agent_name, email: r.email, code: r.mena_me_code, status: 'Updated', reason: '' });
          }
        } else {
          let { error } = await supabase.from('agents').insert(payload);
          if (error && isMenaCodeConstraintError(error.message)) {
            const payloadNoCode = { ...payload, mena_me_code: null };
            error = (await supabase.from('agents').insert(payloadNoCode)).error;
          }
          if (error) {
            finalFailed.push({ ...r, errors: [...r.errors, error.message] });
            allRowStatuses.push({ row: r.rowIndex, name: r.agent_name, email: r.email, code: r.mena_me_code, status: 'Failed', reason: error.message });
          } else {
            successCount++;
            allRowStatuses.push({ row: r.rowIndex, name: r.agent_name, email: r.email, code: r.mena_me_code, status: 'Imported', reason: '' });
          }
        }
      }

      // Add failed/duplicate rows to report
      for (const r of finalFailed) {
        allRowStatuses.push({ row: r.rowIndex, name: r.agent_name || '(empty)', email: r.email, code: r.mena_me_code, status: 'Failed', reason: r.errors.join('; ') });
      }

      // Mark missing agents as inactive
      const uploadedKeys = new Set(
        finalValid
          .filter((r) => r.agent_name && r.email)
          .map((r) => `${r.agent_name.toLowerCase().trim()}||${r.email.toLowerCase().trim()}`)
      );
      const toDeactivate = existingAgentsList.filter((a) => {
        if (!a.agent_name || !a.email) return false;
        const key = `${a.agent_name.toLowerCase().trim()}||${a.email.toLowerCase().trim()}`;
        return !uploadedKeys.has(key);
      });

      if (toDeactivate.length > 0) {
        const idsToDeactivate = toDeactivate.map((a) => a.id);
        await supabase.from('agents').update({ active: false }).in('id', idsToDeactivate);
        logAudit({ action: 'import_deactivate', entity_type: 'agent', page_module: 'agents', new_value: { deactivated_count: idsToDeactivate.length } });
      }

      setSummary({
        total: parsed.length,
        success: successCount,
        updated: updateCount,
        failed: finalFailed.length,
        duplicates: duplicateCount,
        failures: finalFailed.map((r) => ({ row: r.rowIndex, name: r.agent_name || '(empty)', reason: r.errors.join('; ') })),
        allRows: allRowStatuses.sort((a, b) => a.row - b.row),
      });

      // Refresh agents list
      let q = supabase.from('agents').select('*, project:projects(id, name)').order('active', { ascending: false }).order('agent_name', { ascending: true });
      if (activeProjectId) q = q.eq('project_id', activeProjectId);
      const { data: refreshed } = await q;
      if (refreshed) setAgents(refreshed as Agent[]);
      logAudit({ action: 'import', entity_type: 'agent', page_module: 'agents', new_value: { total: summary?.total, success: summary?.success, failed: summary?.failed } });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file');
    }

    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const downloadReport = () => {
    if (!summary) return;
    const headers = ['Row', 'Full Name', 'Email', 'Mename Code', 'Status', 'Error Reason'];
    const data = [headers, ...summary.allRows.map((r) => [r.row, r.name, r.email, r.code, r.status, r.reason])];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import Report');
    XLSX.writeFile(wb, `agent_import_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const toggleActive = async (agent: Agent) => {
    const { data, error } = await supabase.from('agents').update({ active: !agent.active }).eq('id', agent.id).select('*').single();
    if (error) return;
    logAudit({ action: 'toggle_active', entity_type: 'agent', entity_id: agent.id, page_module: 'agents', old_value: { active: agent.active }, new_value: { active: !agent.active } });
    setAgents((prev) => prev.map((a) => (a.id === agent.id ? (data as Agent) : a)));
  };

  if (loading) return <LoadingState label="Loading agents…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={L('page.agents', 'Agent Management')}
        subtitle={`${filtered.length} of ${agents.length} agents`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => navigate({ name: 'data-clearance' })} className="btn-secondary">Data Clearance</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" />
            <button onClick={downloadTemplate} className="btn-secondary">
              <Download className="h-4 w-4" /> Download Template
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={importing} className="btn-primary">
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing ? 'Importing…' : 'Upload Excel'}
            </button>
          </div>
        }
      />

      {/* Error screen with Back / Cancel */}
      {parseError && (
        <div className="card border-rose-200 bg-rose-50 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <XCircle className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-rose-900">Upload Error</h3>
              <p className="mt-1 text-sm text-rose-700">{parseError}</p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => {
                    setParseError(null);
                    // Re-open file picker so user can correct without losing context
                    if (fileRef.current) fileRef.current.value = '';
                    fileRef.current?.click();
                  }}
                  className="btn-secondary"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to Upload
                </button>
                <button
                  onClick={() => { setParseError(null); setLastFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                  className="btn-ghost"
                >
                  <X className="h-4 w-4" /> Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success confirmation + import report */}
      {summary && (
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-900">The agent data has been uploaded successfully.</h3>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <SummaryStat label="Total Records Uploaded" value={summary.total} tone="slate" />
            <SummaryStat label="Successfully Imported" value={summary.success - summary.updated} tone="emerald" />
            <SummaryStat label="Updated Records" value={summary.updated} tone="blue" />
            <SummaryStat label="Duplicate Records" value={summary.duplicates} tone="amber" />
            <SummaryStat label="Failed Records" value={summary.failed} tone="rose" />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button onClick={downloadReport} className="btn-secondary">
              <FileDown className="h-4 w-4" /> Download Validation Report (Excel)
            </button>
            <button onClick={() => setSummary(null)} className="btn-ghost text-xs">Dismiss</button>
          </div>

          {/* Full import validation report table */}
          <div className="mt-5">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Import Validation Report</h4>
            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="table-header sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Row</th>
                    <th className="px-3 py-2 font-semibold">Full Name</th>
                    <th className="px-3 py-2 font-semibold">Email</th>
                    <th className="px-3 py-2 font-semibold">Code</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Error Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.allRows.map((r, i) => (
                    <tr key={i} className="table-row">
                      <td className="px-3 py-2 text-slate-500">{r.row}</td>
                      <td className="px-3 py-2 font-medium text-slate-700">{r.name}</td>
                      <td className="px-3 py-2 text-slate-500">{r.email || '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{r.code || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={cls(
                          r.status === 'Imported' && 'badge-pass',
                          r.status === 'Updated' && 'badge-info',
                          r.status === 'Failed' && 'badge-fail',
                        )}>{r.status}</span>
                      </td>
                      <td className="px-3 py-2 text-rose-600">{r.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, code…" className="input pl-9" />
        </div>
        <select value={filterLOB} onChange={(e) => setFilterLOB(e.target.value)} className="input sm:w-48">
          <option value="">All LOBs</option>
          {lobs.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filterActive} onChange={(e) => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')} className="input sm:w-40">
          <option value="all">All Status</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="No agents found"
          subtitle="Download the template, fill it in, and upload to import agents"
          action={<button onClick={downloadTemplate} className="btn-secondary"><Download className="h-4 w-4" /> Download Template</button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="px-4 py-3 font-semibold">Agent</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Mename Code</th>
                  <th className="px-4 py-3 font-semibold">Project</th>
                  <th className="px-4 py-3 font-semibold">LOB</th>
                  <th className="px-4 py-3 font-semibold">Coach</th>
                  <th className="px-4 py-3 font-semibold">Team Leader</th>
                  <th className="px-4 py-3 font-semibold">Manager</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="table-row">
                    <td className="px-4 py-3 font-medium text-slate-700">{a.agent_name}</td>
                    <td className="px-4 py-3 text-slate-500">{a.email ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{a.mena_me_code ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{a.project?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{a.lob ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{a.coach_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{a.team_leader ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{a.manager_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(a)} className="text-slate-400 hover:text-slate-600">
                        {a.active ? <ToggleRight className="h-5 w-5 text-emerald-500" /> : <ToggleLeft className="h-5 w-5 text-slate-300" />}
                      </button>
                    </td>
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

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'blue' | 'rose' | 'amber' }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-50 text-slate-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    rose: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className={cls('rounded-lg p-3', tones[tone])}>
      <div className="text-xs font-medium opacity-70">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

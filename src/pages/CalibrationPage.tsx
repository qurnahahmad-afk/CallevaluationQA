import { useEffect, useMemo, useState } from 'react';
import {
  GitCompare, Plus, X, Save, ArrowLeft, CheckCircle2, AlertTriangle,
  Users, Calendar, ChevronRight, Download, FileSpreadsheet, FileText, FileType,
  Award, Scale, UserCog, Search, History, ChevronDown,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import { useAuth } from '../lib/auth';
import { cls, fmtDate, fmtDateTime, todayISO, downloadCSV } from '../lib/utils';
import { useL } from '../lib/labels';
import { getFormConfig, createEmptyChecklist, computeScore, TRANSACTION_TYPES } from '../lib/scorecard';
import { useProjects } from '../lib/hooks';
import { PageHeader, LoadingState, ErrorState, EmptyState, ScoreBadge } from '../components/ui';
import type { CalibrationSession, CalibrationEvaluation, ChecklistItem, ChecklistAnswer, FormConfig, Project, Profile } from '../types';

type SessionRow = CalibrationSession & {
  project?: Pick<Project, 'id' | 'name'> | null;
  evaluations?: CalibrationEvaluation[];
};

export function CalibrationPage() {
  const { activeProjectId, projects, profile, hasPermission } = useAuth();
  const L = useL();
  const isQualityOnly = (profile?.role === 'quality' || profile?.role === 'quality_expert') && !hasPermission('manage_users');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // History search filters
  const [searchProject, setSearchProject] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [searchCoach, setSearchCoach] = useState('');
  const [searchTransactionId, setSearchTransactionId] = useState('');
  const [searchTransactionType, setSearchTransactionType] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      let q = supabase
        .from('calibration_sessions')
        .select('*, project:projects(id, name), evaluations:calibration_evaluations(*)')
        .order('created_at', { ascending: false });
      if (activeProjectId) q = q.eq('project_id', activeProjectId);
      const { data, error } = await q;
      if (!active) return;
      if (error) { setError(error.message); setLoading(false); return; }
      let rows = (data ?? []) as SessionRow[];
      if (isQualityOnly && profile) {
        rows = rows.filter((s) => s.expert_user_id === profile.id || (s.evaluations ?? []).some((e) => e.user_id === profile.id));
      }
      setSessions(rows);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [activeProjectId, isQualityOnly, profile]);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (searchProject && s.project_id !== searchProject) return false;
      if (searchDate && s.calibration_date && s.calibration_date.slice(0, 10) !== searchDate) return false;
      if (searchCoach) {
        const coachNames = (s.evaluations ?? []).map((e) => e.user_name.toLowerCase());
        if (!coachNames.some((n) => n.includes(searchCoach.toLowerCase()))) return false;
      }
      if (searchTransactionId && !s.transaction_id.toLowerCase().includes(searchTransactionId.toLowerCase())) return false;
      if (searchTransactionType && s.transaction_type !== searchTransactionType) return false;
      return true;
    });
  }, [sessions, searchProject, searchDate, searchCoach, searchTransactionId, searchTransactionType]);

  const selected = useMemo(() => sessions.find((s) => s.id === selectedId) ?? null, [sessions, selectedId]);

  const buildExportRows = (rows: SessionRow[]) => rows.map((s) => ({
    id: s.id,
    project: s.project?.name ?? '',
    transaction_id: s.transaction_id,
    transaction_type: s.transaction_type,
    calibration_date: s.calibration_date,
    status: s.calibration_status ?? s.status,
    coach_name: (s.evaluations ?? [])[0]?.user_name ?? '',
    expert_name: s.expert_user_name ?? '',
    coach_score: (s.evaluations ?? [])[0]?.call_score ?? '',
    expert_score: s.expert_call_score ?? '',
    agreement_pct: s.agreement_percentage ?? '',
    matching_attributes: s.matching_attributes ?? '',
    different_attributes: s.different_attributes ?? '',
    final_decision: s.final_decision ?? '',
    notes: s.notes ?? '',
    created_at: s.created_at,
  }));

  const handleExportCSV = (rows: SessionRow[], filename: string) => downloadCSV(filename, buildExportRows(rows));

  const handleExportExcel = (rows: SessionRow[], filename: string) => {
    const exportRows = buildExportRows(rows);
    if (exportRows.length === 0) return;
    const headers = Object.keys(exportRows[0]);
    const lines = [headers.join('\t')];
    for (const row of exportRows) {
      lines.push(headers.map((h) => String(row[h as keyof typeof row] ?? '').replace(/\t/g, ' ')).join('\t'));
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = (rows: SessionRow[], title: string) => {
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

  if (loading) return <LoadingState label="Loading calibration sessions…" />;
  if (error) return <ErrorState message={error} />;

  if (selected) {
    return <CalibrationDetail session={selected} projects={projects} profile={profile} onBack={() => setSelectedId(null)} onUpdate={(updated) => setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={L('page.calibration', 'Calibration')}
        subtitle={`${filtered.length} sessions`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => handleExportCSV(filtered, 'calibration_sessions.csv')} disabled={filtered.length === 0} className="btn-ghost text-sm"><FileText className="h-4 w-4" /> {L('button.export_csv', 'CSV')}</button>
            <button onClick={() => handleExportExcel(filtered, 'calibration_sessions.xls')} disabled={filtered.length === 0} className="btn-ghost text-sm"><FileSpreadsheet className="h-4 w-4" /> {L('button.export_excel', 'Excel')}</button>
            <button onClick={() => handleExportPDF(filtered, 'Calibration Report')} disabled={filtered.length === 0} className="btn-ghost text-sm"><FileType className="h-4 w-4" /> {L('button.export_pdf', 'PDF')}</button>
            <button onClick={() => setShowModal(true)} className="btn-primary"><Plus className="h-4 w-4" /> {L('button.new_session', 'New Session')}</button>
          </div>
        }
      />

      {/* History Search */}
      <div className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <label className="label">Project</label>
          <select value={searchProject} onChange={(e) => setSearchProject(e.target.value)} className="input">
            <option value="">All Projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" value={searchDate} onChange={(e) => setSearchDate(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Coach</label>
          <input value={searchCoach} onChange={(e) => setSearchCoach(e.target.value)} placeholder="Search…" className="input" />
        </div>
        <div>
          <label className="label">Transaction ID</label>
          <input value={searchTransactionId} onChange={(e) => setSearchTransactionId(e.target.value)} placeholder="Search…" className="input" />
        </div>
        <div>
          <label className="label">Transaction Type</label>
          <select value={searchTransactionType} onChange={(e) => setSearchTransactionType(e.target.value)} className="input">
            <option value="">All</option>
            {TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<GitCompare className="h-10 w-10" />} title="No calibration sessions" subtitle="Create a session to calibrate QA scoring" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => {
            const memberCount = s.evaluations?.length ?? 0;
            const isCalibrated = s.calibration_status === 'Calibrated';
            return (
              <button key={s.id} onClick={() => setSelectedId(s.id)} className="card p-5 text-left transition hover:shadow-cardHover">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50"><GitCompare className="h-5 w-5 text-brand-600" /></div>
                    <div>
                      <div className="text-sm font-semibold text-slate-700">{s.transaction_id}</div>
                      <div className="text-xs text-slate-400">{s.project?.name ?? '—'} · {s.transaction_type}</div>
                    </div>
                  </div>
                  {isCalibrated ? <span className="badge-pass"><CheckCircle2 className="h-3 w-3" /> Calibrated</span> : <span className="badge bg-amber-50 text-amber-700 ring-1 ring-amber-200">Not Calibrated</span>}
                </div>
                <div className="space-y-1 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {fmtDate(s.calibration_date)}</div>
                  <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {memberCount} member{memberCount !== 1 ? 's' : ''}</div>
                  {s.agreement_percentage != null && <div className="flex items-center gap-1.5"><Scale className="h-3.5 w-3.5" /> Agreement: {s.agreement_percentage}%</div>}
                </div>
                <div className="mt-3 flex items-center justify-end text-xs text-brand-600">View Details <ChevronRight className="h-3 w-3" /></div>
              </button>
            );
          })}
        </div>
      )}

      {showModal && <CreateCalibrationModal projects={projects} activeProjectId={activeProjectId} onClose={() => setShowModal(false)} onCreated={(s) => { setSessions((prev) => [s, ...prev]); setShowModal(false); }} />}
    </div>
  );
}

function CreateCalibrationModal({ projects, activeProjectId, onClose, onCreated }: {
  projects: Project[];
  activeProjectId: string | null;
  onClose: () => void;
  onCreated: (s: SessionRow) => void;
}) {
  const [projectId, setProjectId] = useState(activeProjectId ?? projects[0]?.id ?? '');
  const [transactionId, setTransactionId] = useState('');
  const [transactionType, setTransactionType] = useState('');
  const [calibrationDate, setCalibrationDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!projectId) { setError('Project is required'); return; }
    if (!transactionId.trim()) { setError('Transaction ID is required'); return; }
    setSaving(true); setError(null);
    const { data, error } = await supabase.from('calibration_sessions').insert({
      project_id: projectId, transaction_id: transactionId, transaction_type: transactionType || 'Inbound',
      calibration_date: calibrationDate, status: 'not_calibrated', notes: notes || null,
    }).select('*, project:projects(id, name), evaluations:calibration_evaluations(*)').single();
    if (error) { setError(error.message); setSaving(false); return; }
    logAudit({ action: 'create', entity_type: 'calibration_session', entity_id: data?.id, page_module: 'calibration', new_value: { transaction_id: transactionId, project_id: projectId } });
    onCreated(data as SessionRow); setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">New Calibration Session</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <div className="space-y-3">
          <div><label className="label">Project *</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </div>
          <div><label className="label">Transaction ID *</label>
            <input value={transactionId} onChange={(e) => setTransactionId(e.target.value)} className="input" placeholder="Ticket/call ID" />
          </div>
          <div><label className="label">Transaction Type</label>
            <select value={transactionType} onChange={(e) => setTransactionType(e.target.value)} className="input">{TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </div>
          <div><label className="label">Calibration Date</label>
            <input type="date" value={calibrationDate} onChange={(e) => setCalibrationDate(e.target.value)} className="input" />
          </div>
          <div><label className="label">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="btn-primary"><Save className="h-4 w-4" /> {saving ? 'Creating…' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}

function CalibrationDetail({ session, projects, profile, onBack, onUpdate }: {
  session: SessionRow;
  projects: Project[];
  profile: Profile | null;
  onBack: () => void;
  onUpdate: (s: SessionRow) => void;
}) {
  const project = projects.find((p) => p.id === session.project_id) ?? null;
  const config = getFormConfig(project);
  const [myChecklist, setMyChecklist] = useState<ChecklistItem[]>(() => createEmptyChecklist(config));
  const [expertChecklist, setExpertChecklist] = useState<ChecklistItem[]>(() => session.expert_checklist ?? createEmptyChecklist(config));
  const [saving, setSaving] = useState(false);
  const [expertSaving, setExpertSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'coach' | 'expert' | 'comparison'>('coach');

  const myEvaluation = useMemo(() => {
    if (!profile) return null;
    return (session.evaluations ?? []).find((e) => e.user_id === profile.id) ?? null;
  }, [session.evaluations, profile]);

  const scoreResult = useMemo(() => computeScore(myChecklist, config), [myChecklist, config]);
  const expertScoreResult = useMemo(() => computeScore(expertChecklist, config), [expertChecklist, config]);

  const setAnswer = (setter: React.Dispatch<React.SetStateAction<ChecklistItem[]>>) => (itemId: string, answer: ChecklistAnswer) => {
    setter((cl) => cl.map((i) => (i.id === itemId ? { ...i, answer } : i)));
  };
  const setNote = (setter: React.Dispatch<React.SetStateAction<ChecklistItem[]>>) => (itemId: string, note: string) => {
    setter((cl) => cl.map((i) => (i.id === itemId ? { ...i, note } : i)));
  };

  const handleSubmitCoach = async () => {
    if (!profile) { setError('No profile'); return; }
    setSaving(true); setError(null);
    const payload = { calibration_id: session.id, user_id: profile.id, user_name: profile.full_name, checklist: myChecklist, call_score: scoreResult.callScore, pass_fail: scoreResult.passFail };
    const { data, error } = await supabase.from('calibration_evaluations').upsert(payload, { onConflict: 'calibration_id,user_id' }).select('*').single();
    if (error) { setError(error.message); setSaving(false); return; }
    const updatedEvals = [...(session.evaluations ?? []).filter((e) => e.user_id !== profile.id), data as CalibrationEvaluation];
    const { data: updatedSession } = await supabase.from('calibration_sessions').update({ status: updatedEvals.length >= 2 ? 'calibrated' : 'not_calibrated' }).eq('id', session.id).select('*, project:projects(id, name), evaluations:calibration_evaluations(*)').single();
    if (updatedSession) onUpdate(updatedSession as SessionRow);
    logAudit({ action: 'submit_coach_evaluation', entity_type: 'calibration_evaluation', entity_id: data?.id, page_module: 'calibration', new_value: { call_score: scoreResult.callScore, pass_fail: scoreResult.passFail } });
    setSaving(false);
  };

  const handleSubmitExpert = async () => {
    setExpertSaving(true); setError(null);
    const comparison = computeComparison(myChecklist, expertChecklist, config);
    const calStatus = comparison.isCalibrated ? 'Calibrated' : 'Not Calibrated';
    const { data, error } = await supabase.from('calibration_sessions').update({
      expert_user_id: profile?.id ?? null,
      expert_user_name: profile?.full_name ?? null,
      expert_checklist: expertChecklist,
      expert_call_score: expertScoreResult.callScore,
      expert_pass_fail: expertScoreResult.passFail,
      agreement_percentage: comparison.agreementPct,
      matching_attributes: comparison.matching,
      different_attributes: comparison.different,
      comparison_details: comparison.details,
      calibration_status: calStatus,
      final_decision: calStatus,
      status: 'calibrated',
    }).eq('id', session.id).select('*, project:projects(id, name), evaluations:calibration_evaluations(*)').single();
    if (error) { setError(error.message); setExpertSaving(false); return; }
    logAudit({ action: 'submit_expert_evaluation', entity_type: 'calibration_session', entity_id: session.id, page_module: 'calibration', new_value: { expert_call_score: expertScoreResult.callScore, agreement_percentage: comparison.agreementPct, calibration_status: calStatus } });
    onUpdate(data as SessionRow);
    setExpertSaving(false);
    setActiveTab('comparison');
  };

  const comparison = useMemo(() => {
    if (session.comparison_details) {
      const cfg = config;
      const catCriticalMap: Record<string, boolean> = {};
      if (cfg) for (const cat of cfg.categories) catCriticalMap[cat.key] = cat.critical;
      let criticalMismatches = 0;
      let nonCriticalMismatches = 0;
      for (const d of session.comparison_details) {
        if (!d.match) {
          const item = myChecklist.find((c) => c.id === d.item_id);
          const isCritical = catCriticalMap[item?.category ?? ''] ?? false;
          if (isCritical) criticalMismatches++; else nonCriticalMismatches++;
        }
      }
      return {
        details: session.comparison_details,
        matching: session.matching_attributes ?? 0,
        different: session.different_attributes ?? 0,
        agreementPct: session.agreement_percentage ?? 0,
        isCalibrated: criticalMismatches === 0 && nonCriticalMismatches <= 2,
        criticalMismatches,
        nonCriticalMismatches,
      };
    }
    return computeComparison(myChecklist, expertChecklist, config);
  }, [session, myChecklist, expertChecklist, config]);

  const handleExportSession = (format: 'csv' | 'excel' | 'pdf') => {
    const rows = [session];
    if (format === 'csv') downloadCSV(`calibration_${session.id}.csv`, [{
      transaction_id: session.transaction_id, project: session.project?.name ?? '',
      calibration_date: session.calibration_date, status: session.calibration_status ?? session.status,
      coach_score: myEvaluation?.call_score ?? '', expert_score: session.expert_call_score ?? '',
      agreement_pct: session.agreement_percentage ?? comparison.agreementPct,
      matching: session.matching_attributes ?? comparison.matching,
      different: session.different_attributes ?? comparison.different,
      final_decision: session.final_decision ?? '', notes: session.notes ?? '',
    }]);
    if (format === 'excel') {
      const lines = ['Transaction ID\tProject\tDate\tStatus\tCoach Score\tExpert Score\tAgreement %\tMatching\tDifferent\tFinal Decision\tNotes'];
      lines.push(`${session.transaction_id}\t${session.project?.name ?? ''}\t${session.calibration_date}\t${session.calibration_status ?? session.status}\t${myEvaluation?.call_score ?? ''}\t${session.expert_call_score ?? ''}\t${session.agreement_percentage ?? comparison.agreementPct}\t${session.matching_attributes ?? comparison.matching}\t${session.different_attributes ?? comparison.different}\t${session.final_decision ?? ''}\t${session.notes ?? ''}`);
      const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `calibration_${session.id}.xls`; a.click(); URL.revokeObjectURL(url);
    }
    if (format === 'pdf') {
      const win = window.open('', '_blank'); if (!win) return;
      const compRows = comparison.details.map((d) => `<tr><td style="border:1px solid #ddd;padding:4px 8px;font-size:11px;">${d.label}</td><td style="border:1px solid #ddd;padding:4px 8px;font-size:11px;">${d.coach_answer}</td><td style="border:1px solid #ddd;padding:4px 8px;font-size:11px;">${d.expert_answer}</td><td style="border:1px solid #ddd;padding:4px 8px;font-size:11px;color:${d.match ? 'green' : 'red'}">${d.match ? 'Match' : 'Diff'}</td></tr>`).join('');
      win.document.write(`<html><head><title>Calibration Report</title><style>body{font-family:Arial,sans-serif;margin:20px}table{border-collapse:collapse;width:100%}th{background:#f1f5f9;font-size:11px;padding:4px 8px;border:1px solid #ddd}h1{font-size:18px}h2{font-size:14px;margin-top:20px}</style></head><body>
        <h1>Calibration Report</h1>
        <p><strong>Transaction ID:</strong> ${session.transaction_id} · <strong>Project:</strong> ${session.project?.name ?? ''} · <strong>Date:</strong> ${fmtDate(session.calibration_date)}</p>
        <p><strong>Coach:</strong> ${myEvaluation?.user_name ?? '—'} · <strong>Expert:</strong> ${session.expert_user_name ?? '—'}</p>
        <p><strong>Status:</strong> ${session.calibration_status ?? session.status} · <strong>Agreement:</strong> ${session.agreement_percentage ?? comparison.agreementPct}% · <strong>Decision:</strong> ${session.final_decision ?? '—'}</p>
        <h2>Attribute Comparison</h2>
        <table><thead><tr><th>Attribute</th><th>Coach</th><th>Expert</th><th>Match</th></tr></thead><tbody>${compRows}</tbody></table>
        <p style="margin-top:20px"><strong>Notes:</strong> ${session.notes ?? ''}</p>
      </body></html>`);
      win.document.close(); win.print();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Calibration: ${session.transaction_id}`}
        subtitle={`${fmtDate(session.calibration_date)} · ${session.project?.name ?? ''}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => handleExportSession('csv')} className="btn-ghost text-sm"><FileText className="h-4 w-4" /> CSV</button>
            <button onClick={() => handleExportSession('excel')} className="btn-ghost text-sm"><FileSpreadsheet className="h-4 w-4" /> Excel</button>
            <button onClick={() => handleExportSession('pdf')} className="btn-ghost text-sm"><FileType className="h-4 w-4" /> PDF</button>
            <button onClick={onBack} className="btn-secondary"><ArrowLeft className="h-4 w-4" /> Back</button>
          </div>
        }
      />

      {/* Status Banner */}
      <div className="card flex items-center gap-3 p-4">
        {session.calibration_status === 'Calibrated' ? (
          <><CheckCircle2 className="h-5 w-5 text-emerald-600" /><span className="text-sm font-medium text-emerald-700">Calibrated — Agreement: {session.agreement_percentage ?? comparison.agreementPct}%</span></>
        ) : (
          <><AlertTriangle className="h-5 w-5 text-amber-600" /><span className="text-sm font-medium text-amber-700">Not yet calibrated — complete both evaluations</span></>
        )}
        {comparison.criticalMismatches !== undefined && comparison.criticalMismatches > 0 && (
          <div className="ml-4 text-xs text-rose-600">{comparison.criticalMismatches} critical mismatch(es)</div>
        )}
        {comparison.nonCriticalMismatches !== undefined && comparison.nonCriticalMismatches > 0 && (
          <div className="ml-4 text-xs text-amber-600">{comparison.nonCriticalMismatches} non-critical mismatch(es)</div>
        )}
      </div>

      {/* Calibration History for same transaction */}
      <CalibrationHistory transactionId={session.transaction_id} currentSessionId={session.id} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {([
          { key: 'coach', label: 'Coach Evaluation', icon: Users },
          { key: 'expert', label: 'Expert Evaluation', icon: UserCog },
          { key: 'comparison', label: 'Comparison & Report', icon: Scale },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={cls('flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === t.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Coach Evaluation Tab */}
      {activeTab === 'coach' && (
        <div className="space-y-4">
          {myEvaluation && (
            <div className="card flex items-center justify-between p-3">
              <span className="text-xs text-slate-500">Your submitted score:</span>
              <ScoreBadge score={myEvaluation.call_score} passFail={myEvaluation.pass_fail} />
            </div>
          )}
          <ChecklistForm config={config} checklist={myChecklist} setAnswer={setAnswer(setMyChecklist)} setNote={setNote(setMyChecklist)} />
          <div className="card flex items-center justify-between p-4">
            <ScoreBadge score={scoreResult.callScore} passFail={scoreResult.passFail} />
            <button onClick={handleSubmitCoach} disabled={saving} className="btn-primary"><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Submit Coach Evaluation'}</button>
          </div>
        </div>
      )}

      {/* Expert Evaluation Tab */}
      {activeTab === 'expert' && (
        <div className="space-y-4">
          <div className="card flex items-center gap-2 p-3 text-sm text-slate-600">
            <UserCog className="h-4 w-4 text-brand-600" />
            <span>The Expert Evaluation is the <strong>reference</strong> evaluation used for comparison.</span>
          </div>
          {session.expert_call_score != null && (
            <div className="card flex items-center justify-between p-3">
              <span className="text-xs text-slate-500">Expert submitted score: {session.expert_user_name ?? '—'}</span>
              <ScoreBadge score={session.expert_call_score} passFail={session.expert_pass_fail ?? '—'} />
            </div>
          )}
          <ChecklistForm config={config} checklist={expertChecklist} setAnswer={setAnswer(setExpertChecklist)} setNote={setNote(setExpertChecklist)} />
          <div className="card flex items-center justify-between p-4">
            <ScoreBadge score={expertScoreResult.callScore} passFail={expertScoreResult.passFail} />
            <button onClick={handleSubmitExpert} disabled={expertSaving} className="btn-primary"><Save className="h-4 w-4" /> {expertSaving ? 'Saving…' : 'Submit Expert Evaluation'}</button>
          </div>
        </div>
      )}

      {/* Comparison Tab */}
      {activeTab === 'comparison' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <CompCard label="Coach Score" value={String(myEvaluation?.call_score ?? scoreResult.callScore)} tone="brand" />
            <CompCard label="Expert Score" value={String(session.expert_call_score ?? expertScoreResult.callScore)} tone="blue" />
            <CompCard label="Agreement %" value={`${comparison.agreementPct}%`} tone={comparison.agreementPct >= 80 ? 'emerald' : 'rose'} />
            <CompCard label="Status" value={session.calibration_status ?? (comparison.isCalibrated ? 'Calibrated' : 'Not Calibrated')} tone={comparison.isCalibrated ? 'emerald' : 'rose'} />
          </div>

          {/* Attribute comparison table */}
          <div className="card overflow-hidden">
            <h3 className="border-b border-slate-100 p-4 text-sm font-semibold text-slate-700">Attribute-by-Attribute Comparison</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="px-4 py-3 font-semibold">Attribute</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Coach Answer</th>
                    <th className="px-4 py-3 font-semibold">Expert Answer</th>
                    <th className="px-4 py-3 font-semibold">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.details.map((d, i) => (
                    <tr key={i} className={cls('table-row', !d.match && 'bg-rose-50/50')}>
                      <td className="px-4 py-3 text-slate-700">{d.label}</td>
                      <td className="px-4 py-3">{d.critical ? <span className="badge-fail text-[10px]">Critical</span> : <span className="badge-neutral text-[10px]">Non-Critical</span>}</td>
                      <td className="px-4 py-3 text-slate-600">{d.coach_answer}</td>
                      <td className="px-4 py-3 text-slate-600">{d.expert_answer}</td>
                      <td className="px-4 py-3">
                        {d.match ? <span className="text-emerald-600"><CheckCircle2 className="h-4 w-4" /></span> : <span className="text-rose-600"><AlertTriangle className="h-4 w-4" /></span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Final report */}
          <div className="card p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><Award className="h-4 w-4 text-brand-600" /> Calibration Report</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <ReportItem label="Coach Name" value={myEvaluation?.user_name ?? '—'} />
              <ReportItem label="Expert Name" value={session.expert_user_name ?? '—'} />
              <ReportItem label="Calibration Date" value={fmtDate(session.calibration_date)} />
              <ReportItem label="Project" value={session.project?.name ?? '—'} />
              <ReportItem label="Transaction ID" value={session.transaction_id} />
              <ReportItem label="Calibration Status" value={session.calibration_status ?? (comparison.isCalibrated ? 'Calibrated' : 'Not Calibrated')} />
              <ReportItem label="Overall Agreement" value={`${comparison.agreementPct}%`} />
              <ReportItem label="Matching Attributes" value={String(comparison.matching)} />
              <ReportItem label="Different Attributes" value={String(comparison.different)} />
              <ReportItem label="Final Decision" value={session.final_decision ?? (comparison.isCalibrated ? 'Calibrated' : 'Not Calibrated')} />
            </div>
            {session.notes && <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><strong>Comments:</strong> {session.notes}</div>}
          </div>
        </div>
      )}

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    </div>
  );
}

function ChecklistForm({ config, checklist, setAnswer, setNote }: {
  config: FormConfig;
  checklist: ChecklistItem[];
  setAnswer: (itemId: string, answer: ChecklistAnswer) => void;
  setNote: (itemId: string, note: string) => void;
}) {
  return (
    <>
      {config.categories.map((cat) => (
        <div key={cat.key} className="card p-4">
          <div className="mb-3 flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-700">{cat.label}</h4>
            {cat.critical && <span className="badge-fail">Critical</span>}
          </div>
          <div className="space-y-2">
            {cat.items.map((item) => {
              const ci = checklist.find((i) => i.id === item.id);
              if (!ci) return null;
              return (
                <div key={item.id} className="rounded-lg border border-slate-100 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-700">{item.label}</span>
                    <div className="flex gap-1">
                      {(['Yes', 'No', 'N/A'] as ChecklistAnswer[]).map((ans) => (
                        <button key={ans} onClick={() => setAnswer(item.id, ans)}
                          className={cls('rounded px-2 py-0.5 text-xs font-medium transition',
                            ci.answer === ans ? (ans === 'Yes' ? 'bg-emerald-100 text-emerald-700' : ans === 'No' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700') : 'bg-slate-50 text-slate-400 hover:bg-slate-100')}>
                          {ans}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input value={ci.note ?? ''} onChange={(e) => setNote(item.id, e.target.value)} placeholder="Notes…" className="input mt-1.5 text-xs" />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function CompCard({ label, value, tone }: { label: string; value: string; tone: 'brand' | 'blue' | 'emerald' | 'rose' }) {
  const tones: Record<string, string> = { brand: 'text-brand-600', blue: 'text-blue-600', emerald: 'text-emerald-600', rose: 'text-rose-600' };
  return (
    <div className="stat-card">
      <div className={cls('text-2xl font-bold tabular-nums', tones[tone])}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function ReportItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-700">{value}</span>
    </div>
  );
}

function computeComparison(coachList: ChecklistItem[], expertList: ChecklistItem[], config?: FormConfig) {
  const details: { item_id: string; label: string; coach_answer: string; expert_answer: string; match: boolean; critical: boolean }[] = [];
  let matching = 0;
  let different = 0;
  let criticalMismatches = 0;
  let nonCriticalMismatches = 0;
  const cfg = config ?? null;
  const catCriticalMap: Record<string, boolean> = {};
  if (cfg) for (const cat of cfg.categories) catCriticalMap[cat.key] = cat.critical;
  for (const coachItem of coachList) {
    const expertItem = expertList.find((e) => e.id === coachItem.id);
    const coachAns = coachItem.answer ?? 'N/A';
    const expertAns = expertItem?.answer ?? 'N/A';
    const match = coachAns === expertAns;
    const isCritical = catCriticalMap[coachItem.category] ?? false;
    if (match) matching++; else different++;
    if (!match) {
      if (isCritical) criticalMismatches++; else nonCriticalMismatches++;
    }
    details.push({ item_id: coachItem.id, label: coachItem.label, coach_answer: coachAns, expert_answer: expertAns, match, critical: isCritical });
  }
  const total = matching + different;
  const agreementPct = total > 0 ? Math.round((matching / total) * 100) : 0;
  // Calibrated if: no critical mismatches AND at most 2 non-critical mismatches
  const isCalibrated = criticalMismatches === 0 && nonCriticalMismatches <= 2;
  return { details, matching, different, agreementPct, isCalibrated, criticalMismatches, nonCriticalMismatches };
}

function CalibrationHistory({ transactionId, currentSessionId }: { transactionId: string; currentSessionId: string }) {
  const [history, setHistory] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!transactionId) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from('calibration_sessions')
        .select('*, project:projects(id, name), evaluations:calibration_evaluations(*)')
        .eq('transaction_id', transactionId)
        .neq('id', currentSessionId)
        .order('created_at', { ascending: false });
      setHistory((data ?? []) as SessionRow[]);
      setLoading(false);
    })();
  }, [transactionId, currentSessionId]);

  if (loading || history.length === 0) return null;

  return (
    <div className="card overflow-hidden border-slate-200">
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center gap-2 p-4 text-left">
        <History className="h-4 w-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-700">Previous Calibration Sessions for This Transaction</span>
        <span className="badge-neutral ml-2">{history.length}</span>
        <ChevronDown className={cls('ml-auto h-4 w-4 text-slate-400 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {history.map((h) => (
            <div key={h.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="flex-1">
                <div className="font-medium text-slate-700">{fmtDate(h.calibration_date)}</div>
                <div className="text-xs text-slate-400">{h.project?.name ?? ''} · {h.evaluations?.length ?? 0} evaluation(s)</div>
              </div>
              {h.calibration_status === 'Calibrated' ? (
                <span className="badge-pass text-xs">Calibrated</span>
              ) : (
                <span className="badge-neutral text-xs">Not Calibrated</span>
              )}
              <span className="text-xs text-slate-500">{h.agreement_percentage ?? '—'}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

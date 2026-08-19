import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Save, Clock, Pause, Play, CheckCircle2, XCircle,
  HelpCircle, BookOpen, AlertTriangle, User, Phone, Tag, FileText,
  RotateCcw, Map, Hand, Timer,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import { useAuth } from '../lib/auth';
import { navigate } from '../lib/router';
import { useL } from '../lib/labels';
import { cls, fmtDuration, todayISO } from '../lib/utils';
import {
  getFormConfigForLob, createEmptyChecklist, computeScore, DEFAULT_FORM_CONFIG,
  TASK_TYPES,
} from '../lib/scorecard';
import { useAgents, useReferenceData } from '../lib/hooks';
import { PageHeader, LoadingState, ErrorState, ScoreBadge } from '../components/ui';
import type { ChecklistItem, ChecklistAnswer, FormConfig, Evaluation, Agent } from '../types';

const STEPS = ['Call Details', 'QA Scorecard', 'Diagnostics', 'Review & Save'] as const;

type DraftEval = {
  agent_id: string;
  evaluation_date: string;
  coach_name: string;
  email_date_time: string;
  main_skill: string;
  transaction_link: string;
  caller_number: string;
  call_duration: string;
  task_type: string;
  transaction_type: string;
  customer_verbatim: string;
  comment: string;
  call_summary: string;
  feedback_to_agent: string;
  // Diagnostics
  dsat: boolean;
  dsat_score: string;
  dsat_reason_l1: string;
  dsat_reason_l2: string;
  dsat_reason_l3: string;
  sub_type: string;
  call_subcategory: string;
  repeated_interaction: boolean;
  repeated_reason_l1: string;
  repeated_reason_l2: string;
  repeated_reason_l3: string;
  solved_customer_issue: string;
  fcr_not_achieved_l1: string;
  fcr_not_achieved_l2: string;
  fcr_not_achieved_l3: string;
  agent_follow_service_mapping: string;
  not_follow_mapping_l1: string;
  not_follow_mapping_l2: string;
  valid_hold: string;
  hold_reason: string;
  valid_aht: string;
  long_aht_reason: string;
  core_issue_l1: string;
  core_issue_l2: string;
  core_issue_l3: string;
};

function emptyDraft(): DraftEval {
  return {
    agent_id: '', evaluation_date: todayISO(), coach_name: '', email_date_time: '',
    main_skill: '', transaction_link: '', caller_number: '',
    call_duration: '', task_type: '', transaction_type: '',
    customer_verbatim: '', comment: '', call_summary: '', feedback_to_agent: '',
    dsat: false, dsat_score: '', dsat_reason_l1: '', dsat_reason_l2: '', dsat_reason_l3: '',
    sub_type: '', call_subcategory: '',
    repeated_interaction: false, repeated_reason_l1: '', repeated_reason_l2: '', repeated_reason_l3: '',
    solved_customer_issue: '', fcr_not_achieved_l1: '', fcr_not_achieved_l2: '', fcr_not_achieved_l3: '',
    agent_follow_service_mapping: '', not_follow_mapping_l1: '', not_follow_mapping_l2: '',
    valid_hold: '', hold_reason: '', valid_aht: '', long_aht_reason: '',
    core_issue_l1: '', core_issue_l2: '', core_issue_l3: '',
  };
}

export function NewEvaluation() {
  const { activeProjectId, projects, profile } = useAuth();
  const L = useL();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(activeProjectId);
  const { agents, loading: agentsLoading } = useAgents(selectedProjectId);
  const { refs, glossary, loading: refsLoading } = useReferenceData();

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<DraftEval>(emptyDraft());
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [formConfig, setFormConfig] = useState<FormConfig>(DEFAULT_FORM_CONFIG);
  const [glossaryOpen, setGlossaryOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(true);
  const [selectedLOB, setSelectedLOB] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [caseLockId, setCaseLockId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const caseLockRef = useRef<string | null>(null);
  const completedRef = useRef(false);

  const activeProject = useMemo(() => projects.find((p) => p.id === selectedProjectId) ?? null, [projects, selectedProjectId]);
  const projectAgents = useMemo(() => agents.filter((a) => a.active), [agents]);
  const projectLOBs = useMemo(() => {
    if (activeProject?.lob_config && activeProject.lob_config.length > 0) return activeProject.lob_config;
    const set = new Set<string>();
    projectAgents.forEach((a) => { if (a.lob) set.add(a.lob); });
    return Array.from(set).sort();
  }, [projectAgents, activeProject]);
  const projectTransactionTypes = useMemo(() => activeProject?.transaction_types ?? [], [activeProject]);
  const lobFilteredAgents = useMemo(() => {
    if (!selectedLOB) return projectAgents;
    return projectAgents.filter((a) => a.lob === selectedLOB);
  }, [projectAgents, selectedLOB]);
  const selectedAgent = useMemo(() => agents.find((a) => a.id === draft.agent_id) ?? null, [agents, draft.agent_id]);

  // Initialize form config + checklist when project or LOB changes
  useEffect(() => {
    const project = projects.find((p) => p.id === selectedProjectId) ?? null;
    const config = getFormConfigForLob(project, selectedLOB);
    setFormConfig(config);
    setChecklist((current) => {
      const previous = new Map(current.map((item) => [item.id, item]));
      return createEmptyChecklist(config).map((item) => ({
        ...item,
        answer: previous.get(item.id)?.answer ?? null,
        note: previous.get(item.id)?.note ?? '',
      }));
    });
  }, [selectedProjectId, projects, selectedLOB]);

  useEffect(() => {
    caseLockRef.current = caseLockId;
  }, [caseLockId]);

  useEffect(() => {
    return () => {
      const lockId = caseLockRef.current;
      if (lockId && !completedRef.current) {
        void supabase.from('evaluation_case_locks').update({ released_at: new Date().toISOString() }).eq('id', lockId);
      }
    };
  }, []);

  // Pausable timer
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimerSeconds((s) => s + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  const scoreResult = useMemo(() => computeScore(checklist, formConfig), [checklist, formConfig]);

  const setField = <K extends keyof DraftEval>(key: K, value: DraftEval[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const setAnswer = (itemId: string, answer: ChecklistAnswer) => {
    setChecklist((cl) => cl.map((i) => (i.id === itemId ? { ...i, answer } : i)));
  };

  const setNote = (itemId: string, note: string) => {
    setChecklist((cl) => cl.map((i) => (i.id === itemId ? { ...i, note } : i)));
  };

  const canProceed = useMemo(() => {
    if (step === 0) return draft.agent_id !== '' && draft.evaluation_date !== '' && draft.caller_number.trim() !== '';
    if (step === 1) return scoreResult.answered > 0;
    return true;
  }, [step, draft, scoreResult.answered]);

  const handleNext = async () => {
    if (!canProceed) return;
    if (step !== 0 || caseLockId) {
      setStep((current) => current + 1);
      return;
    }

    setError(null);
    const caseId = draft.caller_number.trim();
    const { data: existingEvaluation, error: evaluationCheckError } = await supabase
      .from('evaluations')
      .select('id')
      .ilike('caller_number', caseId)
      .limit(1)
      .maybeSingle();
    if (evaluationCheckError) { setError('We could not verify this Case ID. Please try again.'); return; }
    if (existingEvaluation) { setError('This Case ID has already been evaluated.'); return; }

    const { data: existingLock, error: lockCheckError } = await supabase
      .from('evaluation_case_locks')
      .select('id')
      .ilike('case_id', caseId)
      .is('released_at', null)
      .limit(1)
      .maybeSingle();
    if (lockCheckError) { setError('We could not verify whether this Case ID is under evaluation.'); return; }
    if (existingLock) { setError('This Case ID is currently under evaluation by another user.'); return; }

    const { data: lock, error: lockError } = await supabase
      .from('evaluation_case_locks')
      .insert({ case_id: caseId, locked_by: profile?.id })
      .select('id')
      .maybeSingle();
    if (lockError || !lock) {
      setError(lockError?.code === '23505' ? 'This Case ID is currently under evaluation by another user.' : 'Unable to start evaluation for this Case ID.');
      return;
    }
    setCaseLockId(lock.id as string);
    setStep((current) => current + 1);
  };

  const handleSave = async () => {
    if (!selectedProjectId) { setError('Please select a project first'); return; }
    if (!profile) { setError('No user profile'); return; }
    setSaving(true);
    setError(null);

    const agent = agents.find((a) => a.id === draft.agent_id) ?? null;
    const insertPayload = {
      ...draft,
      project_id: selectedProjectId,
      coach_user_id: profile.id,
      coach_name: draft.coach_name || profile.full_name,
      call_score: scoreResult.callScore,
      pass_fail: scoreResult.passFail,
      checklist,
      form_config: formConfig,
      evaluation_duration_seconds: timerSeconds,
      agent_id: draft.agent_id,
    };

    const { data, error: insertError } = await supabase
      .from('evaluations')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    const evalId = (data as { id: string }).id;
    completedRef.current = true;
    if (caseLockId) {
      await supabase.from('evaluation_case_locks').update({ evaluation_id: evalId, released_at: new Date().toISOString() }).eq('id', caseLockId);
    }

    logAudit({ action: 'create', entity_type: 'evaluation', entity_id: evalId, page_module: 'new_evaluation', new_value: { agent_id: draft.agent_id, call_score: scoreResult.callScore, pass_fail: scoreResult.passFail } });

    // Auto-create coaching session on fail
    if (scoreResult.passFail === 'Failed') {
      await supabase.from('coaching_sessions').insert({
        evaluation_id: evalId,
        agent_id: draft.agent_id,
        project_id: selectedProjectId,
        scheduled_date: todayISO(),
        status: 'pending',
        notes: `Auto-created from failed evaluation (score: ${scoreResult.callScore})`,
        conducted_by: null,
        confirmed_by: null,
      });
    }

    setSaving(false);
    navigate({ name: 'evaluation', id: evalId });
  };

  if (agentsLoading || refsLoading) return <LoadingState label="Loading…" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={L('page.new_evaluation', 'New Evaluation')}
        subtitle="Create a new QA call evaluation"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTimerRunning((r) => !r)}
              className={cls('btn-secondary', timerRunning ? 'text-amber-600' : 'text-emerald-600')}
            >
              {timerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {fmtDuration(timerSeconds)}
            </button>
          </div>
        }
      />

      {/* Stepper */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center">
              <button
                onClick={() => i < step && setStep(i)}
                className={cls(
                  'flex items-center gap-2 text-sm font-medium transition',
                  i === step ? 'text-brand-600' : i < step ? 'text-emerald-600 cursor-pointer' : 'text-slate-400'
                )}
              >
                <span className={cls(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                  i === step ? 'bg-brand-600 text-white' : i < step ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                )}>
                  {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </button>
              {i < STEPS.length - 1 && <div className={cls('mx-2 h-0.5 flex-1 rounded', i < step ? 'bg-emerald-300' : 'bg-slate-200')} />}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="card flex items-center gap-2 border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Step 0: Call Details */}
      {step === 0 && (
        <div className="space-y-4">
          {projects.length === 0 && (
            <div className="card flex items-center gap-2 border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" /> You have no assigned projects. Please contact an administrator.
            </div>
          )}
          <div className="card space-y-4 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Phone className="h-4 w-4 text-brand-600" /> {L('section.call_details', 'Call Details')}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Project *</label>
                <select
                  value={selectedProjectId ?? ''}
                  onChange={(e) => { setSelectedProjectId(e.target.value || null); setField('agent_id', ''); setSelectedLOB(''); }}
                  className="input"
                >
                  <option value="">All Projects</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">LOB *</label>
                <select value={selectedLOB} onChange={(e) => { setSelectedLOB(e.target.value); setField('agent_id', ''); }} className="input">
                  <option value="">Select LOB…</option>
                  {projectLOBs.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Agent * <span className="font-normal text-slate-400">(search by name, code, or email)</span></label>
                <AgentSearchInput
                  agents={lobFilteredAgents}
                  selectedId={draft.agent_id}
                  search={agentSearch}
                  onSearchChange={setAgentSearch}
                  onSelect={(id) => setField('agent_id', id)}
                  disabled={projects.length === 0}
                />
              </div>
            </div>

            {selectedAgent && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <User className="h-3.5 w-3.5" /> Agent Information (auto-populated)
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <ReadonlyField label="Full Name" value={selectedAgent.agent_name} />
                  <ReadonlyField label="Email" value={selectedAgent.email} />
                  <ReadonlyField label="Mename Code" value={selectedAgent.mena_me_code} />
                  <ReadonlyField label="Project" value={selectedAgent.project?.name} />
                  <ReadonlyField label="LOB" value={selectedAgent.lob} />
                  <ReadonlyField label="Coach" value={selectedAgent.coach_name} />
                  <ReadonlyField label="Team Leader" value={selectedAgent.team_leader} />
                  <ReadonlyField label="Manager" value={selectedAgent.manager_name} />
                  <ReadonlyField label="Date of Joining" value={selectedAgent.date_of_join} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Evaluation Date *</label>
                <input type="date" value={draft.evaluation_date} onChange={(e) => setField('evaluation_date', e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">Coach Name</label>
                <select value={draft.coach_name} onChange={(e) => setField('coach_name', e.target.value)} className="input">
                  <option value="">{profile?.full_name ?? 'Select coach…'}</option>
                  {projectAgents.filter((a) => a.coach_name).reduce((acc: string[], a) => { const n = a.coach_name!; if (!acc.includes(n)) acc.push(n); return acc; }, []).map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{L('field.email_date', 'Email Date')}</label>
                <input type="date" value={draft.email_date_time} onChange={(e) => setField('email_date_time', e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">Main Skill</label>
                <input value={draft.main_skill} onChange={(e) => setField('main_skill', e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">Transaction Link</label>
                <input value={draft.transaction_link} placeholder="https://…" onChange={(e) => setField('transaction_link', e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">Transaction Type</label>
                <select value={draft.transaction_type} onChange={(e) => setField('transaction_type', e.target.value)} className="input">
                  <option value="">Select…</option>
                  {projectTransactionTypes.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{L('field.caller_number', 'Case ID')} *</label>
                <input value={draft.caller_number} onChange={(e) => setField('caller_number', e.target.value)} placeholder="Enter case ID" className="input" />
              </div>
              <div>
                <label className="label">{L('field.call_duration', 'Call Duration')}</label>
                <input type="time" step="1" value={draft.call_duration} onChange={(e) => setField('call_duration', e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">Task Type</label>
                <select value={draft.task_type} onChange={(e) => setField('task_type', e.target.value)} className="input">
                  <option value="">Select…</option>
                  {TASK_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: QA Scorecard */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Live score */}
          <div className="card flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">Live Score</span>
              <ScoreBadge score={scoreResult.callScore} passFail={scoreResult.passFail} />
            </div>
            <div className="flex gap-4 text-xs text-slate-500">
              <span>Answered: {scoreResult.answered}/{scoreResult.total}</span>
              <span>Critical Fails: {scoreResult.criticalFailures}</span>
              <span>Softskill Errors: {scoreResult.softskillErrors}</span>
            </div>
          </div>

          {/* Glossary toggle */}
          <div className="card p-4">
            <button onClick={() => setGlossaryOpen(glossaryOpen === 'all' ? null : 'all')} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <BookOpen className="h-4 w-4 text-brand-600" /> Glossary Reference
            </button>
            {glossaryOpen === 'all' && (
              <div className="mt-3 max-h-48 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs">
                {glossary.length === 0 ? <p className="text-slate-400">No glossary entries.</p> : glossary.map((g) => (
                  <div key={g.id} className="mb-2">
                    <span className="font-semibold text-slate-700">{g.attribute}: </span>
                    <span className="text-slate-500">{g.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Checklist categories */}
          {formConfig.categories.map((cat) => (
            <div key={cat.key} className="card p-5">
              <div className="mb-4 flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-700">{cat.label}</h3>
                {cat.critical && <span className="badge-fail">Critical</span>}
              </div>
              <div className="space-y-3">
                {cat.items.map((item) => {
                  const ci = checklist.find((i) => i.id === item.id);
                  if (!ci) return null;
                  return (
                    <div key={item.id} className="rounded-lg border border-slate-100 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm text-slate-700">{item.label}</span>
                        <div className="flex gap-1">
                          {(['Yes', 'No', 'N/A'] as ChecklistAnswer[]).map((ans) => (
                            <button
                              key={ans}
                              onClick={() => setAnswer(item.id, ans)}
                              className={cls(
                                'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition',
                                ci.answer === ans
                                  ? ans === 'Yes' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                                  : ans === 'No' ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-300'
                                  : 'bg-slate-200 text-slate-700 ring-1 ring-slate-300'
                                  : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                              )}
                            >
                              {ans === 'Yes' ? <CheckCircle2 className="h-3 w-3" /> : ans === 'No' ? <XCircle className="h-3 w-3" /> : <HelpCircle className="h-3 w-3" />}
                              {ans}
                            </button>
                          ))}
                        </div>
                      </div>
                      <input
                        value={ci.note ?? ''}
                        onChange={(e) => setNote(item.id, e.target.value)}
                        placeholder="Notes…"
                        className="input mt-2 text-xs"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Step 2: Diagnostics */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Classification */}
          <div className="card p-5">
            <div className="mb-3 text-sm font-semibold text-slate-700">Call Classification</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Sub classification</label>
                <select value={draft.sub_type} onChange={(e) => setField('sub_type', e.target.value)} className="input">
                  <option value="">Select…</option>
                  {(refs.sub_type ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Ticket Type</label>
                <select value={draft.call_subcategory} onChange={(e) => setField('call_subcategory', e.target.value)} className="input">
                  <option value="">Select…</option>
                  {(refs.call_subcategory ?? refs.sub_category ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* DSAT */}
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <AlertTriangle className="h-4 w-4 text-rose-600" /> DSAT
            </div>
            <label className="flex items-center gap-2 text-sm">
              <select value={draft.dsat_score} onChange={(e) => { const value = e.target.value; setField('dsat_score', value); setField('dsat', value === '1' || value === '2'); }} className="input max-w-xs">
                <option value="">Select DSAT rating…</option>
                <option value="1">1 (Critical)</option>
                <option value="2">2 (Critical)</option>
                <option value="3">3 (Non Critical)</option>
                <option value="4">4 (Normal)</option>
                <option value="5">5 (Normal)</option>
              </select>
            </label>
            {draft.dsat && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="label">DSAT Reason L1</label>
                  <select value={draft.dsat_reason_l1} onChange={(e) => setField('dsat_reason_l1', e.target.value)} className="input">
                    <option value="">Select…</option>
                    {['Agent', 'Process', 'Technical', 'Customer'].map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">DSAT Reason L2</label>
                  <select value={draft.dsat_reason_l2} onChange={(e) => setField('dsat_reason_l2', e.target.value)} className="input">
                    <option value="">Select…</option>
                    {(refs.dsat_reason_l2 ?? ['Knowledge', 'Core Issue']).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">DSAT Reason L3</label>
                  <input value={draft.dsat_reason_l3} onChange={(e) => setField('dsat_reason_l3', e.target.value)} className="input" />
                </div>
              </div>
            )}
          </div>

          {/* FCR */}
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> First Call Resolution
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Solved Customer Issue?</label>
                <select value={draft.solved_customer_issue} onChange={(e) => setField('solved_customer_issue', e.target.value)} className="input">
                  <option value="">Select…</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              {draft.solved_customer_issue === 'No' && (
                <>
                  <div>
                    <label className="label">FCR Not Achieved L1</label>
                    <input value={draft.fcr_not_achieved_l1} onChange={(e) => setField('fcr_not_achieved_l1', e.target.value)} className="input" />
                  </div>
                  <div>
                    <label className="label">FCR Not Achieved L2</label>
                    <input value={draft.fcr_not_achieved_l2} onChange={(e) => setField('fcr_not_achieved_l2', e.target.value)} className="input" />
                  </div>
                  <div>
                    <label className="label">FCR Not Achieved L3</label>
                    <input value={draft.fcr_not_achieved_l3} onChange={(e) => setField('fcr_not_achieved_l3', e.target.value)} className="input" />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Repeated Interaction */}
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <RotateCcw className="h-4 w-4 text-amber-600" /> Repeated Interaction
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.repeated_interaction} onChange={(e) => setField('repeated_interaction', e.target.checked)} className="h-4 w-4 rounded" />
              <span className="text-slate-700">Repeated interaction</span>
            </label>
            {draft.repeated_interaction && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="label">Repeated Reason L1</label>
                  <input value={draft.repeated_reason_l1} onChange={(e) => setField('repeated_reason_l1', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Repeated Reason L2</label>
                  <input value={draft.repeated_reason_l2} onChange={(e) => setField('repeated_reason_l2', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Repeated Reason L3</label>
                  <input value={draft.repeated_reason_l3} onChange={(e) => setField('repeated_reason_l3', e.target.value)} className="input" />
                </div>
              </div>
            )}
          </div>

          {/* Service Mapping */}
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Map className="h-4 w-4 text-indigo-600" /> Service Mapping
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Agent Followed Service Mapping?</label>
                <select value={draft.agent_follow_service_mapping} onChange={(e) => setField('agent_follow_service_mapping', e.target.value)} className="input">
                  <option value="">Select…</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              {draft.agent_follow_service_mapping === 'No' && (
                <>
                  <div>
                    <label className="label">Not Follow Mapping L1</label>
                    <input value={draft.not_follow_mapping_l1} onChange={(e) => setField('not_follow_mapping_l1', e.target.value)} className="input" />
                  </div>
                  <div>
                    <label className="label">Not Follow Mapping L2</label>
                    <input value={draft.not_follow_mapping_l2} onChange={(e) => setField('not_follow_mapping_l2', e.target.value)} className="input" />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Hold + AHT */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="card p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Hand className="h-4 w-4 text-blue-600" /> Hold
              </div>
              <div className="space-y-3">
                <div>
                  <label className="label">Valid Hold?</label>
                  <select value={draft.valid_hold} onChange={(e) => setField('valid_hold', e.target.value)} className="input">
                    <option value="">Select…</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>
                {draft.valid_hold === 'No' && (
                  <div>
                    <label className="label">Hold Reason</label>
                    <input value={draft.hold_reason} onChange={(e) => setField('hold_reason', e.target.value)} className="input" />
                  </div>
                )}
              </div>
            </div>

            <div className="card p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Timer className="h-4 w-4 text-purple-600" /> AHT
              </div>
              <div className="space-y-3">
                <div>
                  <label className="label">Valid AHT?</label>
                  <select value={draft.valid_aht} onChange={(e) => setField('valid_aht', e.target.value)} className="input">
                    <option value="">Select…</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>
                {draft.valid_aht === 'No' && (
                  <div>
                    <label className="label">Long AHT Reason</label>
                    <input value={draft.long_aht_reason} onChange={(e) => setField('long_aht_reason', e.target.value)} className="input" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Core Issue L1-L3 */}
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Tag className="h-4 w-4 text-slate-600" /> Core Issue Classification
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="label">Core Issue L1</label>
                <select value={draft.core_issue_l1} onChange={(e) => setField('core_issue_l1', e.target.value)} className="input">
                  <option value="">Select…</option>
                  {(refs.core_issue_l1 ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Core Issue L2</label>
                <select value={draft.core_issue_l2} onChange={(e) => setField('core_issue_l2', e.target.value)} className="input">
                  <option value="">Select…</option>
                  {(refs.core_issue_l2 ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Core Issue L3</label>
                <select value={draft.core_issue_l3} onChange={(e) => setField('core_issue_l3', e.target.value)} className="input">
                  <option value="">Select…</option>
                  {(refs.core_issue_l3 ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Review & Save */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Review Summary</h3>
              <ScoreBadge score={scoreResult.callScore} passFail={scoreResult.passFail} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <ReviewStat label="Agent" value={agents.find((a) => a.id === draft.agent_id)?.agent_name ?? '—'} />
              <ReviewStat label="Date" value={draft.evaluation_date} />
              <ReviewStat label="Duration" value={fmtDuration(timerSeconds)} />
              <ReviewStat label="Transaction Link" value={draft.transaction_link || '—'} />
              <ReviewStat label="Task Type" value={draft.task_type || '—'} />
              <ReviewStat label="Transaction" value={draft.transaction_type || '—'} />
              <ReviewStat label="DSAT" value={draft.dsat ? 'Yes' : 'No'} />
              <ReviewStat label="Repeated" value={draft.repeated_interaction ? 'Yes' : 'No'} />
            </div>
          </div>

          {/* Narratives */}
          <div className="card space-y-4 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <FileText className="h-4 w-4 text-brand-600" /> Narratives
            </div>
            <div>
              <label className="label">Customer Verbatim</label>
              <textarea value={draft.customer_verbatim} onChange={(e) => setField('customer_verbatim', e.target.value)} rows={2} className="input" />
            </div>
            <div>
              <label className="label">Call Summary</label>
              <textarea value={draft.call_summary} onChange={(e) => setField('call_summary', e.target.value)} rows={2} className="input" />
            </div>
            <div>
              <label className="label">Comment</label>
              <textarea value={draft.comment} onChange={(e) => setField('comment', e.target.value)} rows={2} className="input" />
            </div>
            <div>
              <label className="label">Feedback to Agent</label>
              <textarea value={draft.feedback_to_agent} onChange={(e) => setField('feedback_to_agent', e.target.value)} rows={2} className="input" />
            </div>
          </div>

          {/* Checklist summary */}
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Checklist Summary</h3>
            <div className="space-y-1 text-xs">
              {formConfig.categories.map((cat) => {
                const catItems = checklist.filter((i) => i.category === cat.key);
                const yes = catItems.filter((i) => i.answer === 'Yes').length;
                const no = catItems.filter((i) => i.answer === 'No').length;
                const na = catItems.filter((i) => i.answer === 'N/A').length;
                return (
                  <div key={cat.key} className="flex items-center justify-between rounded px-2 py-1 hover:bg-slate-50">
                    <span className="text-slate-600">{cat.label}</span>
                    <span className="tabular-nums text-slate-400">
                      <span className="text-emerald-600">{yes}</span> / <span className="text-rose-600">{no}</span> / <span className="text-slate-400">{na}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {scoreResult.passFail === 'Failed' && (
            <div className="card flex items-center gap-2 border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              This evaluation will fail. A coaching session will be automatically created.
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => step > 0 ? setStep(step - 1) : navigate({ name: 'dashboard' })}
          className="btn-secondary"
        >
          <ArrowLeft className="h-4 w-4" /> {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < 3 ? (
          <button onClick={handleNext} disabled={!canProceed} className="btn-primary">
            Next <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <Clock className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save Evaluation'}
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="truncate text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="truncate text-sm text-slate-700">{value || '—'}</div>
    </div>
  );
}

function AgentSearchInput({ agents, selectedId, search, onSearchChange, onSelect, disabled }: {
  agents: Agent[];
  selectedId: string;
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const selected = agents.find((a) => a.id === selectedId);

  const filtered = useMemo(() => {
    if (!search.trim()) return agents.slice(0, 20);
    const q = search.toLowerCase();
    return agents.filter((a) =>
      (a.agent_name ?? '').toLowerCase().includes(q) ||
      (a.mena_me_code ?? '').toLowerCase().includes(q) ||
      (a.email ?? '').toLowerCase().includes(q)
    ).slice(0, 20);
  }, [agents, search]);

  if (selected && !search) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <span className="text-sm font-medium text-slate-700">{selected.agent_name}</span>
          {selected.mena_me_code && <span className="ml-2 text-xs text-slate-400">({selected.mena_me_code})</span>}
          {selected.email && <span className="ml-2 text-xs text-slate-400">{selected.email}</span>}
        </div>
        <button onClick={() => { onSelect(''); onSearchChange(''); }} className="text-xs text-brand-600 hover:underline">Change</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={search}
        onChange={(e) => { onSearchChange(e.target.value); setShowDropdown(true); }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        placeholder="Search by name, code, or email…"
        disabled={disabled}
        className="input"
      />
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.map((a) => (
            <button
              key={a.id}
              onMouseDown={(e) => { e.preventDefault(); onSelect(a.id); onSearchChange(''); setShowDropdown(false); }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-700">{a.agent_name}</span>
              <span className="text-xs text-slate-400">
                {a.mena_me_code ? a.mena_me_code : a.email ? a.email : ''}
              </span>
            </button>
          ))}
        </div>
      )}
      {showDropdown && filtered.length === 0 && search && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-400 shadow-lg">
          No agents found
        </div>
      )}
    </div>
  );
}

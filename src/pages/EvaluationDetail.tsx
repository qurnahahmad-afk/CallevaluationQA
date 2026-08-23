import { useEffect, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, XCircle, HelpCircle, User, Phone, Tag, FileText,
  AlertTriangle, RotateCcw, Map, Hand, Timer, GraduationCap, Clock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { navigate } from '../lib/router';
import { cls, fmtDate, fmtDateTime, fmtDuration, fmtCallDuration } from '../lib/utils';
import { computeScore } from '../lib/scorecard';
import { PageHeader, LoadingState, ErrorState, EmptyState, ScoreBadge } from '../components/ui';
import { useL } from '../lib/labels';
import { useAuth } from '../lib/auth';
import type { Evaluation, CoachingSession, FormConfig, ChecklistAnswer, Agent, Project, Profile } from '../types';

type DetailRow = Evaluation & {
  agent?: Pick<Agent, 'id' | 'agent_name' | 'lob' | 'team_leader' | 'project_id'> | null;
  project?: Pick<Project, 'id' | 'name'> | null;
  coach_profile?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};

export function EvaluationDetail({ id }: { id: string }) {
  const L = useL();
  const { profile, hasPermission } = useAuth();
  const [evaluation, setEvaluation] = useState<DetailRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftChecklist, setDraftChecklist] = useState<NonNullable<Evaluation['checklist']>>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [coaching, setCoaching] = useState<CoachingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('evaluations')
        .select('*, agent:agents(id, agent_name, lob, team_leader, project_id), project:projects(id, name), coach_profile:profiles(id, full_name, email)')
        .eq('id', id)
        .maybeSingle();
      if (!active) return;
      if (error) { setError(error.message); setLoading(false); return; }
      if (!data) { setError('Evaluation not found'); setLoading(false); return; }
      setEvaluation(data as DetailRow);
      setDraftChecklist((data as DetailRow).checklist ?? []);

      const { data: coachingData } = await supabase
        .from('coaching_sessions')
        .select('*, agent:agents(id, agent_name), evaluation:evaluations(id, call_score, pass_fail), project:projects(id, name)')
        .eq('evaluation_id', id)
        .maybeSingle();
      if (!active) return;
      setCoaching((coachingData as CoachingSession | null) ?? null);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [id]);

  if (loading) return <LoadingState label="Loading evaluation…" />;
  if (error) return <ErrorState message={error} onRetry={() => navigate({ name: 'evaluations' })} />;
  if (!evaluation) return <EmptyState title="Not found" />;

  const config = (evaluation.form_config ?? null) as FormConfig | null;
  const scoreResult = config ? computeScore(editing ? draftChecklist : (evaluation.checklist ?? []), config) : null;
  const ageDays = (Date.now() - new Date(evaluation.created_at ?? evaluation.evaluation_date).getTime()) / 86400000;
  const role = profile?.role;
  const canEdit = role === 'admin' || (hasPermission('modify_score') && ((role === 'manager' && ageDays <= 20) || ((role === 'quality' || role === 'quality_expert' || role === 'coach') && ageDays <= 1)));

  const updateAnswer = (itemId: string, answer: ChecklistAnswer) => {
    setDraftChecklist((items) => items.map((item) => item.id === itemId ? { ...item, answer } : item));
  };

  const saveEdit = async () => {
    if (!evaluation || !config) return;
    setSavingEdit(true);
    setEditError(null);
    const nextScore = computeScore(draftChecklist, config);
    const { data, error: updateError } = await supabase.from('evaluations').update({ checklist: draftChecklist, call_score: nextScore.callScore, pass_fail: nextScore.passFail }).eq('id', evaluation.id).select('*, agent:agents(id, agent_name, lob, team_leader, project_id), project:projects(id, name), coach_profile:profiles(id, full_name, email)').maybeSingle();
    if (updateError || !data) {
      setEditError(updateError?.message ?? 'Unable to save changes.');
    } else {
      setEvaluation(data as DetailRow);
      setEditing(false);
    }
    setSavingEdit(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={L('page.evaluation_detail', 'Evaluation Detail')}
        subtitle={fmtDateTime(evaluation.evaluation_date)}
        actions={
          <div className="flex gap-2">
            {canEdit && !editing && <button onClick={() => { setDraftChecklist(evaluation.checklist ?? []); setEditing(true); }} className="btn-secondary">{L('button.edit', 'Edit')}</button>}
            {editing && <button onClick={() => void saveEdit()} disabled={savingEdit} className="btn-primary">{savingEdit ? 'Saving…' : L('button.save', 'Save Changes')}</button>}
            {editing && <button onClick={() => { setEditing(false); setEditError(null); }} className="btn-secondary">{L('button.cancel', 'Cancel')}</button>}
            <button onClick={() => navigate({ name: 'evaluations' })} className="btn-secondary">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          </div>
        }
      />

      {editError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{editError}</div>}

      {/* Score banner */}
      <div className={cls(
        'card flex flex-col items-center gap-4 p-6 sm:flex-row sm:justify-between',
        evaluation.pass_fail === 'Pass' ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'
      )}>
        <div className="flex items-center gap-4">
          {evaluation.pass_fail === 'Pass' ? (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
              <XCircle className="h-7 w-7 text-rose-600" />
            </div>
          )}
          <div>
            <div className="text-3xl font-bold tabular-nums text-slate-900">{evaluation.call_score}</div>
            <div className="text-sm text-slate-500">{evaluation.pass_fail === 'Pass' ? 'Passed' : 'Failed'}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {scoreResult && (
            <>
              <div className="text-center">
                <div className="text-lg font-bold text-slate-700">{scoreResult.criticalFailures}</div>
                <div className="text-xs text-slate-400">Critical Fails</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-slate-700">{scoreResult.softskillErrors}</div>
                <div className="text-xs text-slate-400">Softskill Errors</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-slate-700">{scoreResult.answered}/{scoreResult.total}</div>
                <div className="text-xs text-slate-400">Answered</div>
              </div>
            </>
          )}
          {evaluation.evaluation_duration_seconds != null && (
            <div className="text-center">
              <div className="text-lg font-bold text-slate-700">{fmtDuration(evaluation.evaluation_duration_seconds)}</div>
              <div className="text-xs text-slate-400">Duration</div>
            </div>
          )}
        </div>
      </div>

      {/* Agent metadata + coaching info */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <User className="h-4 w-4 text-brand-600" /> Agent & Call Info
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <MetaItem label="Agent" value={evaluation.agent?.agent_name ?? '—'} />
            <MetaItem label="LOB" value={evaluation.agent?.lob ?? '—'} />
            <MetaItem label="Team Leader" value={evaluation.agent?.team_leader ?? '—'} />
            <MetaItem label="Project" value={evaluation.project?.name ?? '—'} />
            <MetaItem label="Coach" value={evaluation.coach_name ?? evaluation.coach_profile?.full_name ?? '—'} />
            <MetaItem label="Task Type" value={evaluation.task_type ?? '—'} />
            <MetaItem label="Transaction Type" value={evaluation.transaction_type ?? '—'} />
            <MetaItem label={L('field.caller_number', 'Case ID')} value={evaluation.caller_number ?? '—'} />
            <MetaItem label={L('field.email_date', 'Email Date')} value={evaluation.email_date_time ? fmtDate(evaluation.email_date_time) : '—'} />
            <MetaItem label={L('field.call_duration', 'Call Duration')} value={fmtCallDuration(evaluation.call_duration)} />
            <MetaItem label="Transaction Link" value={evaluation.transaction_link ?? '—'} />
            <MetaItem label="Main Skill" value={evaluation.main_skill ?? '—'} />
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <GraduationCap className="h-4 w-4 text-brand-600" /> Coaching
          </h3>
          {coaching ? (
            <div className="space-y-2 text-sm">
              <MetaItem label="Status" value={coaching.status} />
              <MetaItem label="Scheduled Date" value={fmtDate(coaching.scheduled_date)} />
              {coaching.conducted_date && <MetaItem label="Conducted Date" value={fmtDate(coaching.conducted_date)} />}
              {coaching.duration_minutes != null && <MetaItem label="Duration" value={`${coaching.duration_minutes} min`} />}
              {coaching.notes && <MetaItem label="Notes" value={coaching.notes} />}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No coaching session linked to this evaluation.</p>
          )}
        </div>
      </div>

      {/* QA Scorecard */}
      {config && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <CheckCircle2 className="h-4 w-4 text-brand-600" /> QA Scorecard
          </h3>
          {config.categories.map((cat) => {
            const catItems = (evaluation.checklist ?? []).filter((i) => i.category === cat.key);
            return (
              <div key={cat.key} className="card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-700">{cat.label}</h4>
                  {cat.critical && <span className="badge-fail">Critical</span>}
                </div>
                <div className="space-y-2">
                  {catItems.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3">
                      <div className="flex-1">
                        <div className="text-sm text-slate-700">{item.label}</div>
                        {item.note && <div className="mt-1 text-xs text-slate-400">{item.note}</div>}
                      </div>
                      {editing ? (
                        <div className="flex gap-1">
                          {(['Yes', 'No', 'N/A'] as ChecklistAnswer[]).map((answer) => <button key={answer} onClick={() => updateAnswer(item.id, answer)} className={cls('rounded-md px-2 py-1 text-xs font-semibold', item.answer === answer ? answer === 'No' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600')}>{answer}</button>)}
                        </div>
                      ) : <AnswerBadge answer={item.answer} />}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Narratives */}
      <div className="card p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <FileText className="h-4 w-4 text-brand-600" /> Narratives
        </h3>
        <div className="space-y-4 text-sm">
          <Narrative label="Customer Verbatim" value={evaluation.customer_verbatim} />
          <Narrative label="Call Summary" value={evaluation.call_summary} />
          <Narrative label="Comment" value={evaluation.comment} />
          <Narrative label="Feedback to Agent" value={evaluation.feedback_to_agent} />
        </div>
      </div>

      {/* Diagnostics */}
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> Diagnostics
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* DSAT */}
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <AlertTriangle className="h-4 w-4 text-rose-600" /> DSAT
            </div>
            <div className="space-y-2 text-sm">
              <MetaItem label="DSAT Rating" value={evaluation.dsat_score ?? (evaluation.dsat ? 'Critical' : '—')} />
              {evaluation.dsat && (
                <>
                  <MetaItem label="Reason L1" value={evaluation.dsat_reason_l1} />
                  <MetaItem label="Reason L2" value={evaluation.dsat_reason_l2} />
                  <MetaItem label="Reason L3" value={evaluation.dsat_reason_l3} />
                </>
              )}
            </div>
          </div>

          {/* FCR */}
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> First Call Resolution
            </div>
            <div className="space-y-2 text-sm">
              <MetaItem label="Solved" value={evaluation.solved_customer_issue} />
              {evaluation.solved_customer_issue === 'No' && (
                <>
                  <MetaItem label="FCR L1" value={evaluation.fcr_not_achieved_l1} />
                  <MetaItem label="FCR L2" value={evaluation.fcr_not_achieved_l2} />
                  <MetaItem label="FCR L3" value={evaluation.fcr_not_achieved_l3} />
                </>
              )}
            </div>
          </div>

          {/* Repeated */}
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <RotateCcw className="h-4 w-4 text-amber-600" /> Repeated Interaction
            </div>
            <div className="space-y-2 text-sm">
              <MetaItem label="Repeated" value={evaluation.repeated_interaction ? 'Yes' : 'No'} />
              {evaluation.repeated_interaction && (
                <>
                  <MetaItem label="Reason L1" value={evaluation.repeated_reason_l1} />
                  <MetaItem label="Reason L2" value={evaluation.repeated_reason_l2} />
                  <MetaItem label="Reason L3" value={evaluation.repeated_reason_l3} />
                </>
              )}
            </div>
          </div>

          {/* Service Mapping */}
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Map className="h-4 w-4 text-indigo-600" /> Service Mapping
            </div>
            <div className="space-y-2 text-sm">
              <MetaItem label="Followed Mapping" value={evaluation.agent_follow_service_mapping} />
              {evaluation.agent_follow_service_mapping === 'No' && (
                <>
                  <MetaItem label="Not Follow L1" value={evaluation.not_follow_mapping_l1} />
                  <MetaItem label="Not Follow L2" value={evaluation.not_follow_mapping_l2} />
                </>
              )}
            </div>
          </div>

          {/* Hold */}
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Hand className="h-4 w-4 text-blue-600" /> Hold
            </div>
            <div className="space-y-2 text-sm">
              <MetaItem label="Valid Hold" value={evaluation.valid_hold} />
              {evaluation.valid_hold === 'No' && <MetaItem label="Hold Reason" value={evaluation.hold_reason} />}
            </div>
          </div>

          {/* AHT */}
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Timer className="h-4 w-4 text-purple-600" /> AHT
            </div>
            <div className="space-y-2 text-sm">
              <MetaItem label="Valid AHT" value={evaluation.valid_aht} />
              {evaluation.valid_aht === 'No' && <MetaItem label="Long AHT Reason" value={evaluation.long_aht_reason} />}
            </div>
          </div>

          {/* Core Issue */}
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Tag className="h-4 w-4 text-slate-600" /> Core Issue
            </div>
            <div className="space-y-2 text-sm">
              <MetaItem label="Core Issue L1" value={evaluation.core_issue_l1} />
              <MetaItem label="Core Issue L2" value={evaluation.core_issue_l2} />
              <MetaItem label="Core Issue L3" value={evaluation.core_issue_l3} />
            </div>
          </div>

          {/* Sub Type */}
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Clock className="h-4 w-4 text-slate-600" /> Sub Classification
            </div>
            <div className="space-y-2 text-sm">
              <MetaItem label="Sub classification" value={evaluation.sub_type} />
              <MetaItem label="Ticket Type" value={evaluation.call_subcategory} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="font-medium text-slate-700">{value || '—'}</div>
    </div>
  );
}

function Narrative({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{value || '—'}</div>
    </div>
  );
}

function AnswerBadge({ answer }: { answer: ChecklistAnswer | null }) {
  if (!answer) return <span className="badge-neutral">—</span>;
  if (answer === 'Yes') return <span className="badge-pass"><CheckCircle2 className="h-3 w-3" /> Yes</span>;
  if (answer === 'No') return <span className="badge-fail"><XCircle className="h-3 w-3" /> No</span>;
  return <span className="badge-neutral"><HelpCircle className="h-3 w-3" /> N/A</span>;
}

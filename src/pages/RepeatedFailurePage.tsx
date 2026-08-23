import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  AlertTriangle, ArrowRight, Bell, CheckCircle2, Clock, FileText,
  Users, Shield, X, Send, RefreshCw, ChevronDown, ChevronRight, Award,
  ClipboardCheck, Plus, Trash2, Edit2, Save, Lock, Eye, FileQuestion,
  CheckSquare, Square,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { cls, fmtDate, fmtDateTime } from '../lib/utils';
import { PageHeader, LoadingState, ErrorState, EmptyState, ScoreBadge } from '../components/ui';
import { useL } from '../lib/labels';
import type { Evaluation, Agent, RepeatedFailureProcess, Profile, RFAssessment, RFAssessmentQuestion, FormConfig, ChecklistItem } from '../types';

type EvalWithAgent = Evaluation & {
  agent?: Pick<Agent, 'id' | 'agent_name' | 'lob' | 'team_leader' | 'coach_name' | 'manager_name'> | null;
};

type RFPRow = RepeatedFailureProcess & {
  agent?: Pick<Agent, 'id' | 'agent_name' | 'lob' | 'team_leader' | 'coach_name' | 'manager_name'> | null;
  project?: { id: string; name: string } | null;
};

type DetectedAgent = {
  agent: Pick<Agent, 'id' | 'agent_name' | 'lob' | 'team_leader' | 'coach_name' | 'manager_name' | 'project_id'>;
  project_name: string;
  trigger_reason: string;
  trigger_categories: string[];
  trigger_error_count: number;
  trigger_evaluation_ids: string[];
  evaluations: EvalWithAgent[];
};

const FOUR_MONTHS_MS = 120 * 24 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const STATUS_LABELS: Record<string, string> = {
  pending_operation_remove: 'Pending Queue Removal',
  pending_coaching_done: 'Pending Coaching Completion',
  pending_assessment_create: 'Pending Assessment Creation',
  pending_assessment_submit: 'Pending Agent Assessment Submission',
  pending_assessment_review: 'Pending Coach Assessment Review',
  pending_quality_feedback: 'Pending Quality Feedback (24h Lock)',
  pending_evaluation: 'Pending Inline Evaluation',
  pending_process_confirm: 'Pending Process Confirmation',
  pending_manager_action: 'Pending Manager Action',
  pending_manager_confirm: 'Pending Manager Confirmation',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const CYCLE_LABELS: Record<number, string> = {
  1: 'Cycle 1 — Coaching',
  2: 'Cycle 2 — Training & Shadowing',
  3: 'Cycle 3 — Manager Action',
};

function categorizeError(item: ChecklistItem): 'customer' | 'business' | 'compliance' | 'noncritical' | null {
  if (item.answer !== 'No') return null;
  if (item.category === 'Customer Critical') return 'customer';
  if (item.category === 'Business Critical') return 'business';
  if (item.category === 'Compliance Critical') return 'compliance';
  return 'noncritical';
}

/**
 * Detect repeated failure.
 * For Cycle 1 (first detection): 2+ Customer/Business/Compliance Critical in different calls,
 *   3+ combined critical, or 4+ Non-Critical.
 * For Cycle 2+ escalation: 1+ of ANY critical category (Customer, Business, or Compliance)
 *   in a NEW evaluation conducted after the previous cycle started.
 */
function detectRepeatedFailure(
  evaluations: EvalWithAgent[],
  options?: { sinceDate?: string; requireNewEval?: boolean; previousCategories?: string[] }
): {
  triggered: boolean;
  reason: string;
  categories: string[];
  errorCount: number;
  evaluationIds: string[];
} {
  const now = Date.now();
  let recent = evaluations.filter((e) => {
    if (!e.evaluation_date) return false;
    const evTime = new Date(e.evaluation_date).getTime();
    return now - evTime <= FOUR_MONTHS_MS;
  });

  // If we have a sinceDate (cycle start), only look at evals AFTER that date
  if (options?.sinceDate && options?.requireNewEval) {
    const sinceTime = new Date(options.sinceDate).getTime();
    recent = recent.filter((e) => {
      if (!e.evaluation_date) return false;
      return new Date(e.evaluation_date).getTime() > sinceTime;
    });
  }

  const byCategory: Record<string, { count: number; evalIds: Set<string> }> = {
    customer: { count: 0, evalIds: new Set() },
    business: { count: 0, evalIds: new Set() },
    compliance: { count: 0, evalIds: new Set() },
    noncritical: { count: 0, evalIds: new Set() },
  };

  for (const ev of recent) {
    for (const item of (ev.checklist ?? []) as ChecklistItem[]) {
      const cat = categorizeError(item);
      if (!cat) continue;
      byCategory[cat].count++;
      byCategory[cat].evalIds.add(ev.id);
    }
  }

  const cats = byCategory;
  const allEvalIds = new Set<string>();
  const triggeredCats: string[] = [];

  if (options?.requireNewEval && options.previousCategories) {
    // Cycle 2+ escalation: 1+ of ANY critical category in a new eval
    const anyCritical = cats.customer.count >= 1 || cats.business.count >= 1 || cats.compliance.count >= 1;
    if (anyCritical) {
      if (cats.customer.count >= 1) { triggeredCats.push('Customer Critical'); for (const id of cats.customer.evalIds) allEvalIds.add(id); }
      if (cats.business.count >= 1) { triggeredCats.push('Business Critical'); for (const id of cats.business.evalIds) allEvalIds.add(id); }
      if (cats.compliance.count >= 1) { triggeredCats.push('Compliance Critical'); for (const id of cats.compliance.evalIds) allEvalIds.add(id); }
    }
    // Also check 4+ non-critical
    if (cats.noncritical.count >= 4) {
      triggeredCats.push('Non-Critical');
      for (const id of cats.noncritical.evalIds) allEvalIds.add(id);
    }
  } else {
    // Cycle 1 detection rules
    if (cats.customer.count >= 2 && cats.customer.evalIds.size >= 2) {
      triggeredCats.push('Customer Critical');
      for (const id of cats.customer.evalIds) allEvalIds.add(id);
    }
    if (cats.business.count >= 2 && cats.business.evalIds.size >= 2) {
      triggeredCats.push('Business Critical');
      for (const id of cats.business.evalIds) allEvalIds.add(id);
    }
    if (cats.compliance.count >= 2 && cats.compliance.evalIds.size >= 2) {
      triggeredCats.push('Compliance Critical');
      for (const id of cats.compliance.evalIds) allEvalIds.add(id);
    }
    // 2+ Business + Customer combined
    if (!triggeredCats.includes('Business Critical') || !triggeredCats.includes('Customer Critical')) {
      const combined = new Set([...cats.business.evalIds, ...cats.customer.evalIds]);
      const combinedCount = cats.business.count + cats.customer.count;
      if (combinedCount >= 2 && combined.size >= 2 &&
          !(cats.business.count >= 2 && cats.business.evalIds.size >= 2) &&
          !(cats.customer.count >= 2 && cats.customer.evalIds.size >= 2)) {
        if (!triggeredCats.includes('Business Critical')) triggeredCats.push('Business Critical');
        if (!triggeredCats.includes('Customer Critical')) triggeredCats.push('Customer Critical');
        for (const id of combined) allEvalIds.add(id);
      }
    }
    // 3+ combined critical
    if (cats.business.count + cats.customer.count + cats.compliance.count >= 3) {
      const combined3 = new Set([...cats.business.evalIds, ...cats.customer.evalIds, ...cats.compliance.evalIds]);
      if (combined3.size >= 3) {
        for (const c of ['Customer Critical', 'Business Critical', 'Compliance Critical']) {
          if (!triggeredCats.includes(c)) triggeredCats.push(c);
        }
        for (const id of combined3) allEvalIds.add(id);
      }
    }
    // 4+ Non-Critical
    if (cats.noncritical.count >= 4 && cats.noncritical.evalIds.size >= 2) {
      triggeredCats.push('Non-Critical');
      for (const id of cats.noncritical.evalIds) allEvalIds.add(id);
    }
  }

  if (triggeredCats.length === 0) {
    return { triggered: false, reason: '', categories: [], errorCount: 0, evaluationIds: [] };
  }

  const totalErrors = cats.customer.count + cats.business.count + cats.compliance.count + cats.noncritical.count;
  const reason = `${triggeredCats.join(' + ')} — ${totalErrors} error(s) across ${allEvalIds.size} call(s) in 4 months`;

  return {
    triggered: true,
    reason,
    categories: triggeredCats,
    errorCount: totalErrors,
    evaluationIds: Array.from(allEvalIds),
  };
}

export function RepeatedFailurePage() {
  const { profile, activeProjectId, projects, hasPermission } = useAuth();
  const L = useL();
  const [tab, setTab] = useState<'detected' | 'active' | 'history'>('detected');
  const [evaluations, setEvaluations] = useState<EvalWithAgent[]>([]);
  const [processes, setProcesses] = useState<RFPRow[]>([]);
  const [assessments, setAssessments] = useState<Map<string, RFAssessment>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [coachingSessions, setCoachingSessions] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pid = activeProjectId;
      let evalQuery = supabase
        .from('evaluations')
        .select('*, agent:agents(id, agent_name, lob, team_leader, coach_name, manager_name, project_id)')
        .order('evaluation_date', { ascending: false })
        .limit(2000);
      if (pid) evalQuery = evalQuery.eq('project_id', pid);
      const { data: evalData, error: evalErr } = await evalQuery;
      if (evalErr) throw new Error(evalErr.message);
      setEvaluations((evalData ?? []) as EvalWithAgent[]);

      let procQuery = supabase
        .from('repeated_failure_processes')
        .select('*, agent:agents(id, agent_name, lob, team_leader, coach_name, manager_name), project:projects(id, name), coach_profile:profiles!coach_user_id(id, full_name), operation_profile:profiles!operation_user_id(id, full_name), manager_profile:profiles!manager_user_id(id, full_name)')
        .order('created_at', { ascending: false });
      if (pid) procQuery = procQuery.eq('project_id', pid);
      const { data: procData, error: procErr } = await procQuery;
      if (procErr) throw new Error(procErr.message);
      setProcesses((procData ?? []) as RFPRow[]);

      const { data: profData } = await supabase.from('profiles').select('id, full_name, email, role, active').eq('active', true).order('full_name');
      if (profData) setAllProfiles(profData as Profile[]);

      // Load assessments for active processes
      const activeProcIds = (procData ?? []).filter((p) => p.status !== 'completed' && p.status !== 'cancelled').map((p) => p.id);
      if (activeProcIds.length > 0) {
        const { data: assessData } = await supabase.from('rf_assessments').select('*').in('rf_process_id', activeProcIds).order('created_at', { ascending: false });
        const amap = new Map<string, RFAssessment>();
        for (const a of (assessData ?? []) as RFAssessment[]) {
          if (!amap.has(a.rf_process_id)) amap.set(a.rf_process_id, a);
        }
        setAssessments(amap);
      }

      // Load coaching sessions linked to RF processes
      const { data: coachData } = await supabase.from('coaching_sessions').select('id, agent_id, status, notes, conducted_date').order('created_at', { ascending: false }).limit(500);
      const csMap = new Map<string, string>();
      for (const cs of (coachData ?? []) as { id: string; agent_id: string; status: string; notes: string | null }[]) {
        if (cs.notes && cs.notes.includes('Repeated Failure')) {
          csMap.set(cs.agent_id, cs.id);
        }
      }
      setCoachingSessions(csMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => { load(); }, [load]);

  const detectedAgents = useMemo<DetectedAgent[]>(() => {
    const byAgent = new Map<string, EvalWithAgent[]>();
    for (const ev of evaluations) {
      if (!ev.agent_id || !ev.agent) continue;
      const key = ev.agent_id;
      if (!byAgent.has(key)) byAgent.set(key, []);
      byAgent.get(key)!.push(ev);
    }
    const results: DetectedAgent[] = [];
    for (const [agentId, evals] of byAgent) {
      const det = detectRepeatedFailure(evals);
      if (!det.triggered) continue;
      const first = evals[0];
      if (!first.agent) continue;
      const proj = projects.find((p) => p.id === first.agent!.project_id);
      results.push({
        agent: first.agent,
        project_name: proj?.name ?? '—',
        trigger_reason: det.reason,
        trigger_categories: det.categories,
        trigger_error_count: det.errorCount,
        trigger_evaluation_ids: det.evaluationIds,
        evaluations: evals.filter((e) => det.evaluationIds.includes(e.id)),
      });
    }
    return results.sort((a, b) => b.trigger_error_count - a.trigger_error_count);
  }, [evaluations, projects]);

  const activeAgentIds = useMemo(() => {
    return new Set(processes.filter((p) => p.status !== 'completed' && p.status !== 'cancelled').map((p) => p.agent_id));
  }, [processes]);

  const newDetected = detectedAgents.filter((d) => !activeAgentIds.has(d.agent.id));
  const activeProcesses = processes.filter((p) => p.status !== 'completed' && p.status !== 'cancelled');
  const completedProcesses = processes.filter((p) => p.status === 'completed' || p.status === 'cancelled');

  const sendNotification = async (userId: string, type: string, title: string, message: string, relatedId?: string) => {
    await supabase.from('notifications').insert({
      user_id: userId, type, title, message, related_id: relatedId ?? null, read: false,
    });
  };

  const handleStartProcess = async (detected: DetectedAgent) => {
    setActionLoading(detected.agent.id);
    try {
      const { data, error: insertErr } = await supabase.from('repeated_failure_processes').insert({
        agent_id: detected.agent.id,
        project_id: activeProjectId ?? detected.agent.project_id,
        cycle: 1,
        trigger_reason: detected.trigger_reason,
        trigger_categories: detected.trigger_categories,
        trigger_error_count: detected.trigger_error_count,
        trigger_evaluation_ids: detected.trigger_evaluation_ids,
        status: 'pending_operation_remove',
        coach_user_id: profile?.id ?? null,
      }).select('*').single();
      if (insertErr) throw new Error(insertErr.message);

      const operationUsers = allProfiles.filter((p) => p.role === 'operation' || p.role === 'admin');
      for (const op of operationUsers) {
        await sendNotification(op.id, 'rf_queue_removal', 'Repeated Failure — Remove Agent from Queue',
          `Agent ${detected.agent.agent_name} has been flagged for repeated failure: ${detected.trigger_reason}. Please remove from queue and create a coaching session.`, data.id);
      }

      await logAudit({ action: 'start_rf_process', entity_type: 'repeated_failure_process', entity_id: data.id, page_module: 'repeated_failure', new_value: { agent: detected.agent.agent_name, reason: detected.trigger_reason } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start process');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAdvanceStatus = async (processId: string, newStatus: string, extras?: Record<string, unknown>) => {
    setActionLoading(processId);
    try {
      const { error: updateErr } = await supabase.from('repeated_failure_processes')
        .update({ status: newStatus, updated_at: new Date().toISOString(), ...extras })
        .eq('id', processId);
      if (updateErr) throw new Error(updateErr.message);
      await logAudit({ action: 'advance_rf_process', entity_type: 'repeated_failure_process', entity_id: processId, page_module: 'repeated_failure', new_value: { status: newStatus, ...extras } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update process');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateCoachingSession = async (proc: RFPRow) => {
    setActionLoading(proc.id);
    try {
      const { data: session, error: sessionErr } = await supabase.from('coaching_sessions').insert({
        evaluation_id: proc.trigger_evaluation_ids[0] ?? null,
        agent_id: proc.agent_id,
        project_id: proc.project_id,
        scheduled_date: new Date().toISOString().slice(0, 10),
        status: 'scheduled',
        conducted_by: profile?.full_name ?? 'Operation',
        notes: `Repeated Failure ${CYCLE_LABELS[proc.cycle] ?? ''} — ${proc.trigger_reason}`,
      }).select('*').single();
      if (sessionErr) throw new Error(sessionErr.message);

      // Move to pending_coaching_done — coaching session status stays "scheduled", NOT auto-confirmed
      await handleAdvanceStatus(proc.id, 'pending_coaching_done', {
        coaching_session_id: session.id,
        operation_user_id: profile?.id ?? null,
      });

      // Notify coach that coaching session is created by operation
      if (proc.coach_user_id) {
        await sendNotification(proc.coach_user_id, 'rf_coaching_created', 'Coaching Session Created',
          `A coaching session has been created by Operation for ${proc.agent?.agent_name ?? 'agent'} (RF ${CYCLE_LABELS[proc.cycle] ?? ''}). Please proceed with coaching.`, proc.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create coaching session');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateTrainingSession = async (proc: RFPRow) => {
    setActionLoading(proc.id);
    try {
      const { data: session, error: sessionErr } = await supabase.from('coaching_sessions').insert({
        evaluation_id: proc.trigger_evaluation_ids[0] ?? null,
        agent_id: proc.agent_id,
        project_id: proc.project_id,
        scheduled_date: new Date().toISOString().slice(0, 10),
        status: 'scheduled',
        conducted_by: profile?.full_name ?? 'Operation',
        notes: `Repeated Failure ${CYCLE_LABELS[proc.cycle] ?? ''} — Training & Shadowing — ${proc.trigger_reason}`,
      }).select('*').single();
      if (sessionErr) throw new Error(sessionErr.message);

      await handleAdvanceStatus(proc.id, 'pending_coaching_done', {
        coaching_session_id: session.id,
        operation_user_id: profile?.id ?? null,
      });

      if (proc.coach_user_id) {
        await sendNotification(proc.coach_user_id, 'rf_training_created', 'Training & Shadowing Session Created',
          `A training & shadowing session has been created by Operation for ${proc.agent?.agent_name ?? 'agent'} (RF ${CYCLE_LABELS[proc.cycle] ?? ''}). Please proceed.`, proc.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create training session');
    } finally {
      setActionLoading(null);
    }
  };

  // Coach marks coaching done → moves to assessment creation
  const handleMarkCoachingDone = async (proc: RFPRow) => {
    await handleAdvanceStatus(proc.id, 'pending_assessment_create', {
      coaching_done_at: new Date().toISOString(),
    });
  };

  // Coach creates assessment with custom questions → sends to agent
  const handleSendAssessment = async (proc: RFPRow, questions: RFAssessmentQuestion[], title: string) => {
    setActionLoading(proc.id);
    try {
      const { data, error: assessErr } = await supabase.from('rf_assessments').insert({
        rf_process_id: proc.id,
        coach_user_id: profile?.id,
        title,
        questions,
        status: 'sent',
      }).select('*').single();
      if (assessErr) throw new Error(assessErr.message);

      await handleAdvanceStatus(proc.id, 'pending_assessment_submit', {
        assessment_id: data.id,
      });

      // Notify agent (via operation/coach) that assessment is ready
      const operationUsers = allProfiles.filter((p) => p.role === 'operation' || p.role === 'admin');
      for (const op of operationUsers) {
        await sendNotification(op.id, 'rf_assessment_sent', `Assessment Sent to Agent — ${proc.agent?.agent_name ?? ''}`,
          `An assessment has been created and sent to agent ${proc.agent?.agent_name ?? ''}. Please ensure the agent completes it.`, proc.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send assessment');
    } finally {
      setActionLoading(null);
    }
  };

  // Coach reviews agent's submitted assessment → pass/fail
  const handleReviewAssessment = async (proc: RFPRow, passed: boolean, score: number) => {
    setActionLoading(proc.id);
    try {
      const assessId = proc.assessment_id;
      if (assessId) {
        await supabase.from('rf_assessments').update({
          agent_passed: passed,
          agent_score: score,
          status: 'reviewed',
          updated_at: new Date().toISOString(),
        }).eq('id', assessId);
      }

      const operationUsers = allProfiles.filter((p) => p.role === 'operation' || p.role === 'admin');
      for (const op of operationUsers) {
        await sendNotification(op.id, 'rf_assessment_result', `Assessment ${passed ? 'Passed' : 'Failed'} — ${proc.agent?.agent_name ?? ''}`,
          `Agent ${proc.agent?.agent_name ?? ''} has ${passed ? 'passed' : 'failed'} the assessment with score ${score}. ${passed ? 'Quality feedback will be requested after 24 hours.' : 'Coach will prepare a new assessment.'}`, proc.id);
      }

      if (passed) {
        // Pass → request quality feedback after 24h
        await handleAdvanceStatus(proc.id, 'pending_quality_feedback', {
          assessment_passed: true,
          assessment_score: score,
          quality_feedback_requested_at: new Date().toISOString(),
        });
      } else {
        // Fail → back to assessment creation for a new attempt
        await handleAdvanceStatus(proc.id, 'pending_assessment_create', {
          assessment_passed: false,
          assessment_score: score,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review assessment');
    } finally {
      setActionLoading(null);
    }
  };

  // Operation requests quality feedback — locked for 24h
  const handleRequestQualityFeedback = async (proc: RFPRow) => {
    setActionLoading(proc.id);
    try {
      const qualityUsers = allProfiles.filter((p) => p.role === 'quality' || p.role === 'quality_expert' || p.role === 'admin');
      for (const qa of qualityUsers) {
        await sendNotification(qa.id, 'rf_quality_feedback', 'Quality Feedback Requested',
          `Please evaluate agent ${proc.agent?.agent_name ?? ''} who has completed RF ${CYCLE_LABELS[proc.cycle] ?? ''} coaching. A new evaluation is needed within the Repeated Failure page.`, proc.id);
      }
      await handleAdvanceStatus(proc.id, 'pending_evaluation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request feedback');
    } finally {
      setActionLoading(null);
    }
  };

  // Quality submits inline evaluation → pass moves to confirm, fail moves to cycle 2
  const handleInlineEvaluation = async (proc: RFPRow, callScore: number, passFail: string, checklist: ChecklistItem[], remark: string) => {
    setActionLoading(proc.id);
    try {
      // Create a real evaluation record
      const { data: evalData, error: evalErr } = await supabase.from('evaluations').insert({
        agent_id: proc.agent_id,
        project_id: proc.project_id,
        evaluation_date: new Date().toISOString().slice(0, 10),
        coach_name: profile?.full_name ?? 'Quality',
        coach_user_id: profile?.id,
        call_score: callScore,
        pass_fail: passFail,
        checklist,
        comment: remark,
        call_summary: `RF ${CYCLE_LABELS[proc.cycle] ?? ''} quality feedback evaluation`,
        task_type: 'Quality Feedback',
        transaction_type: 'RF Evaluation',
      }).select('id').single();
      if (evalErr) throw new Error(evalErr.message);

      await handleAdvanceStatus(proc.id, 'pending_process_confirm', {
        rf_evaluation_id: evalData.id,
        eval_call_score: callScore,
        eval_pass_fail: passFail,
        eval_checklist: checklist,
        eval_remark: remark,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit evaluation');
    } finally {
      setActionLoading(null);
    }
  };

  // Operation confirms process complete
  // If eval PASS → completed. If eval FAIL → escalate to cycle 2 (training & shadowing)
  const handleConfirmProcess = async (proc: RFPRow) => {
    setActionLoading(proc.id);
    try {
      const evalPass = proc.eval_pass_fail === 'Pass';

      if (evalPass) {
        // PASS → complete the process
        await handleAdvanceStatus(proc.id, 'completed', {
          operation_confirmed_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });
      } else {
        // FAIL → escalate to cycle 2 (training & shadowing)
        // Only if cycle < 3
        const nextCycle = proc.cycle + 1;
        if (nextCycle <= 3) {
          const { data: newProc, error: insertErr } = await supabase.from('repeated_failure_processes').insert({
            agent_id: proc.agent_id,
            project_id: proc.project_id,
            cycle: nextCycle,
            trigger_reason: `Escalated from ${CYCLE_LABELS[proc.cycle] ?? ''} — evaluation FAILED (score: ${proc.eval_call_score ?? '—'})`,
            trigger_categories: proc.trigger_categories,
            trigger_error_count: proc.trigger_error_count,
            trigger_evaluation_ids: proc.trigger_evaluation_ids,
            status: nextCycle === 3 ? 'pending_manager_action' : 'pending_operation_remove',
            coach_user_id: proc.coach_user_id,
          }).select('*').single();
          if (insertErr) throw new Error(insertErr.message);

          if (nextCycle === 3) {
            const managers = allProfiles.filter((p) => p.role === 'manager' || p.role === 'admin');
            for (const m of managers) {
              await sendNotification(m.id, 'rf_manager_action', 'Manager Action Required — Repeated Failure Cycle 3',
                `Agent ${proc.agent?.agent_name ?? ''} has reached Cycle 3 of Repeated Failure. Please take appropriate action.`, newProc.id);
            }
          } else {
            const operationUsers = allProfiles.filter((p) => p.role === 'operation' || p.role === 'admin');
            for (const op of operationUsers) {
              await sendNotification(op.id, 'rf_next_cycle', `Repeated Failure ${CYCLE_LABELS[nextCycle] ?? ''} — Remove from Queue`,
                `Agent ${proc.agent?.agent_name ?? ''} has escalated to ${CYCLE_LABELS[nextCycle] ?? ''}. Please remove from queue.`, newProc.id);
            }
          }
        }

        // Mark current process as completed (escalated)
        await handleAdvanceStatus(proc.id, 'completed', {
          operation_confirmed_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm process');
    } finally {
      setActionLoading(null);
    }
  };

  const handleManagerAction = async (proc: RFPRow, action: string, feedback: string) => {
    setActionLoading(proc.id);
    try {
      await handleAdvanceStatus(proc.id, 'pending_manager_confirm', {
        manager_user_id: profile?.id ?? null,
        manager_action: action,
        manager_feedback: feedback,
      });
      const operationUsers = allProfiles.filter((p) => p.role === 'operation' || p.role === 'admin');
      for (const op of operationUsers) {
        await sendNotification(op.id, 'rf_manager_done', 'Manager Action Completed',
          `Manager has taken action on ${proc.agent?.agent_name ?? ''}. Action: ${action}. Please confirm.`, proc.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit manager action');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelProcess = async (proc: RFPRow) => {
    setActionLoading(proc.id);
    await handleAdvanceStatus(proc.id, 'cancelled', { completed_at: new Date().toISOString() });
  };

  if (loading) return <LoadingState label="Loading repeated failure data…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={L('page.repeated_failure', 'Repeated Failure')}
        subtitle="Agents with repeated critical errors within 4 months"
        actions={
          <button onClick={load} className="btn-ghost text-sm"><RefreshCw className="h-4 w-4" /> Refresh</button>
        }
      />

      {/* Rules Info Card */}
      <div className="card p-4">
        <div className="flex items-start gap-2 text-sm text-slate-600">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium text-slate-700">Repeated Failure Detection Rules (within 4 months):</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-slate-500">
              <li>2+ Customer Critical errors in different calls</li>
              <li>2+ Business Critical errors in different calls</li>
              <li>2+ Compliance Critical errors in different calls</li>
              <li>2+ Business + Customer Critical combined in different calls</li>
              <li>3+ combined Critical errors (Business + Customer + Compliance)</li>
              <li>4+ Non-Critical errors</li>
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              <strong>Cycle escalation:</strong> If the quality feedback evaluation FAILS, the agent escalates to the next cycle.
              Cycle 2 (Training & Shadowing) activates only when a new evaluation with a critical error is conducted after Cycle 1 started.
              Cycle 3 escalates to Manager Action.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {([
          { key: 'detected', label: `Newly Detected (${newDetected.length})`, icon: AlertTriangle },
          { key: 'active', label: `Active Processes (${activeProcesses.length})`, icon: Clock },
          { key: 'history', label: `History (${completedProcesses.length})`, icon: CheckCircle2 },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cls('flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === t.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Newly Detected Tab */}
      {tab === 'detected' && (
        <div className="space-y-3">
          {newDetected.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-10 w-10" />} title="No repeated failures detected" subtitle="No agents currently meet the repeated failure criteria" />
          ) : (
            newDetected.map((d) => (
              <div key={d.agent.id} className="card overflow-hidden">
                <button
                  onClick={() => setExpandedAgent(expandedAgent === d.agent.id ? null : d.agent.id)}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    {expandedAgent === d.agent.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{d.agent.agent_name}</p>
                      <p className="text-xs text-slate-500">{d.agent.lob} · {d.project_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {d.trigger_categories.map((c) => (
                      <span key={c} className={cls('rounded-full px-2.5 py-0.5 text-xs font-medium',
                        c === 'Customer Critical' ? 'bg-emerald-50 text-emerald-700' :
                        c === 'Business Critical' ? 'bg-blue-50 text-blue-700' :
                        c === 'Compliance Critical' ? 'bg-amber-50 text-amber-700' :
                        'bg-slate-100 text-slate-600')}>{c}</span>
                    ))}
                    <span className="text-xs font-bold text-rose-600">{d.trigger_error_count} errors</span>
                  </div>
                </button>
                {expandedAgent === d.agent.id && (
                  <div className="border-t border-slate-100 p-4">
                    <p className="mb-3 text-sm text-slate-600">{d.trigger_reason}</p>
                    <div className="mb-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="table-header">
                            <th className="px-3 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-left">Score</th>
                            <th className="px-3 py-2 text-left">Pass/Fail</th>
                            <th className="px-3 py-2 text-left">Failed Attributes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.evaluations.map((ev) => {
                            const failed = (ev.checklist ?? []).filter((i: ChecklistItem) => i.answer === 'No');
                            return (
                              <tr key={ev.id} className="table-row">
                                <td className="px-3 py-2 text-slate-600">{fmtDate(ev.evaluation_date)}</td>
                                <td className="px-3 py-2"><ScoreBadge score={ev.call_score ?? 0} passFail={ev.pass_fail ?? '—'} /></td>
                                <td className="px-3 py-2">{ev.pass_fail}</td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap gap-1">
                                    {failed.map((f: ChecklistItem) => (
                                      <span key={f.id} className={cls('rounded px-1.5 py-0.5 text-xs',
                                        f.category === 'Customer Critical' ? 'bg-emerald-50 text-emerald-700' :
                                        f.category === 'Business Critical' ? 'bg-blue-50 text-blue-700' :
                                        f.category === 'Compliance Critical' ? 'bg-amber-50 text-amber-700' :
                                        'bg-slate-100 text-slate-600')}>{f.label}</span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <button
                      onClick={() => handleStartProcess(d)}
                      disabled={actionLoading === d.agent.id}
                      className="btn-primary"
                    >
                      <Send className="h-4 w-4" /> {actionLoading === d.agent.id ? 'Starting…' : 'Start RF Process & Notify Operation'}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Active Processes Tab */}
      {tab === 'active' && (
        <div className="space-y-3">
          {activeProcesses.length === 0 ? (
            <EmptyState icon={<Clock className="h-10 w-10" />} title="No active processes" subtitle="Start a process from the Newly Detected tab" />
          ) : (
            activeProcesses.map((proc) => (
              <ProcessCard
                key={proc.id}
                proc={proc}
                profile={profile}
                allProfiles={allProfiles}
                actionLoading={actionLoading}
                hasPermission={hasPermission}
                assessment={assessments.get(proc.id)}
                evaluations={evaluations.filter((e) => e.agent_id === proc.agent_id)}
                onAdvance={handleAdvanceStatus}
                onCreateCoaching={handleCreateCoachingSession}
                onCreateTraining={handleCreateTrainingSession}
                onMarkCoachingDone={handleMarkCoachingDone}
                onSendAssessment={handleSendAssessment}
                onReviewAssessment={handleReviewAssessment}
                onRequestQualityFeedback={handleRequestQualityFeedback}
                onInlineEvaluation={handleInlineEvaluation}
                onConfirmProcess={handleConfirmProcess}
                onManagerAction={handleManagerAction}
                onCancelProcess={handleCancelProcess}
              />
            ))
          )}
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="space-y-3">
          {completedProcesses.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-10 w-10" />} title="No completed processes" />
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="px-4 py-3 text-left">Agent</th>
                    <th className="px-4 py-3 text-left">Cycle</th>
                    <th className="px-4 py-3 text-left">Reason</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Created</th>
                    <th className="px-4 py-3 text-left">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {completedProcesses.map((p) => (
                    <tr key={p.id} className="table-row">
                      <td className="px-4 py-3 font-medium text-slate-700">{p.agent?.agent_name ?? '—'}</td>
                      <td className="px-4 py-3">{CYCLE_LABELS[p.cycle] ?? `Cycle ${p.cycle}`}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{p.trigger_reason}</td>
                      <td className="px-4 py-3">
                        <span className={p.status === 'completed' ? 'badge-pass' : 'badge-neutral'}>{STATUS_LABELS[p.status] ?? p.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(p.created_at)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{p.completed_at ? fmtDate(p.completed_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ====== Process Card ======
function ProcessCard({
  proc, profile, allProfiles, actionLoading, hasPermission, assessment, evaluations,
  onAdvance, onCreateCoaching, onCreateTraining, onMarkCoachingDone,
  onSendAssessment, onReviewAssessment, onRequestQualityFeedback,
  onInlineEvaluation, onConfirmProcess, onManagerAction, onCancelProcess,
}: {
  proc: RFPRow;
  profile: Profile | null;
  allProfiles: Profile[];
  actionLoading: string | null;
  hasPermission: (k: string) => boolean;
  assessment: RFAssessment | undefined;
  evaluations: EvalWithAgent[];
  onAdvance: (id: string, status: string, extras?: Record<string, unknown>) => Promise<void>;
  onCreateCoaching: (proc: RFPRow) => Promise<void>;
  onCreateTraining: (proc: RFPRow) => Promise<void>;
  onMarkCoachingDone: (proc: RFPRow) => Promise<void>;
  onSendAssessment: (proc: RFPRow, questions: RFAssessmentQuestion[], title: string) => Promise<void>;
  onReviewAssessment: (proc: RFPRow, passed: boolean, score: number) => Promise<void>;
  onRequestQualityFeedback: (proc: RFPRow) => Promise<void>;
  onInlineEvaluation: (proc: RFPRow, callScore: number, passFail: string, checklist: ChecklistItem[], remark: string) => Promise<void>;
  onConfirmProcess: (proc: RFPRow) => Promise<void>;
  onManagerAction: (proc: RFPRow, action: string, feedback: string) => Promise<void>;
  onCancelProcess: (proc: RFPRow) => Promise<void>;
}) {
  const [showAssessmentBuilder, setShowAssessmentBuilder] = useState(false);
  const [showAssessmentReview, setShowAssessmentReview] = useState(false);
  const [showManagerAction, setShowManagerAction] = useState(false);
  const [showInlineEval, setShowInlineEval] = useState(false);
  const [managerAction, setManagerAction] = useState('');
  const [managerFeedback, setManagerFeedback] = useState('');

  const isCoach = profile?.role === 'coach' || profile?.role === 'admin';
  const isOperation = profile?.role === 'operation' || profile?.role === 'admin';
  const isManager = profile?.role === 'manager' || profile?.role === 'admin';
  const isQuality = profile?.role === 'quality' || profile?.role === 'quality_expert' || profile?.role === 'admin';

  const steps = useMemo(() => {
    if (proc.cycle === 3) return ['pending_manager_action', 'pending_manager_confirm', 'pending_process_confirm'];
    return [
      'pending_operation_remove', 'pending_coaching_done', 'pending_assessment_create',
      'pending_assessment_submit', 'pending_assessment_review',
      'pending_quality_feedback', 'pending_evaluation', 'pending_process_confirm',
    ];
  }, [proc.cycle]);

  const currentStepIndex = steps.indexOf(proc.status);

  // 24h lock check for quality feedback
  const qualityFeedbackLocked = useMemo(() => {
    if (proc.status !== 'pending_quality_feedback' || !proc.quality_feedback_requested_at) return false;
    const elapsed = Date.now() - new Date(proc.quality_feedback_requested_at).getTime();
    return elapsed < TWENTY_FOUR_HOURS_MS;
  }, [proc.status, proc.quality_feedback_requested_at]);

  const qualityLockRemaining = useMemo(() => {
    if (!qualityFeedbackLocked || !proc.quality_feedback_requested_at) return '';
    const remaining = TWENTY_FOUR_HOURS_MS - (Date.now() - new Date(proc.quality_feedback_requested_at).getTime());
    const hours = Math.ceil(remaining / (60 * 60 * 1000));
    return `${hours}h remaining`;
  }, [qualityFeedbackLocked, proc.quality_feedback_requested_at]);

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{proc.agent?.agent_name ?? 'Unknown Agent'}</h3>
            <span className="badge-neutral text-xs">{CYCLE_LABELS[proc.cycle] ?? `Cycle ${proc.cycle}`}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{proc.trigger_reason}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cls('rounded-full px-3 py-1 text-xs font-medium',
            proc.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
            proc.status === 'cancelled' ? 'bg-slate-100 text-slate-500' :
            'bg-amber-50 text-amber-700')}>{STATUS_LABELS[proc.status] ?? proc.status}</span>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="mb-4 flex items-center gap-1 overflow-x-auto">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center gap-1">
            <div className={cls('flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium',
              i < currentStepIndex ? 'bg-emerald-50 text-emerald-700' :
              i === currentStepIndex ? 'bg-brand-50 text-brand-700' :
              'bg-slate-50 text-slate-400')}>
              {i < currentStepIndex && <CheckCircle2 className="h-3.5 w-3.5" />}
              {i === currentStepIndex && <Clock className="h-3.5 w-3.5" />}
              <span className="whitespace-nowrap">{STATUS_LABELS[step] ?? step}</span>
            </div>
            {i < steps.length - 1 && <ArrowRight className="h-3 w-3 shrink-0 text-slate-300" />}
          </div>
        ))}
      </div>

      {/* Categories */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {proc.trigger_categories.map((c) => (
          <span key={c} className={cls('rounded-full px-2.5 py-0.5 text-xs font-medium',
            c === 'Customer Critical' ? 'bg-emerald-50 text-emerald-700' :
            c === 'Business Critical' ? 'bg-blue-50 text-blue-700' :
            c === 'Compliance Critical' ? 'bg-amber-50 text-amber-700' :
            'bg-slate-100 text-slate-600')}>{c}</span>
        ))}
      </div>

      {/* Coaching session info */}
      {proc.coaching_session_id && (
        <div className="mb-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
          <strong>Coaching Session:</strong> Created — visible in both Repeated Failure and Coaching pages.
          {proc.coaching_done_at && <span className="ml-2 text-emerald-600">Completed on {fmtDate(proc.coaching_done_at)}</span>}
        </div>
      )}

      {/* Action Area based on status */}
      <div className="border-t border-slate-100 pt-3">
        {/* Operation creates coaching/training session */}
        {proc.status === 'pending_operation_remove' && isOperation && (
          <div className="flex items-center gap-2">
            {proc.cycle === 1 ? (
              <button onClick={() => onCreateCoaching(proc)} disabled={actionLoading === proc.id} className="btn-primary">
                <Users className="h-4 w-4" /> {actionLoading === proc.id ? 'Creating…' : 'Create Coaching Session'}
              </button>
            ) : proc.cycle === 2 ? (
              <button onClick={() => onCreateTraining(proc)} disabled={actionLoading === proc.id} className="btn-primary">
                <Users className="h-4 w-4" /> {actionLoading === proc.id ? 'Creating…' : 'Create Training & Shadowing Session'}
              </button>
            ) : null}
            <button onClick={() => onCancelProcess(proc)} disabled={actionLoading === proc.id} className="btn-ghost text-xs text-rose-500">Cancel</button>
          </div>
        )}

        {/* Coach marks coaching done — coaching session status does NOT auto-change to confirmed */}
        {proc.status === 'pending_coaching_done' && isCoach && (
          <div>
            <p className="mb-2 text-sm text-slate-600">
              Coaching session is in progress. The session status stays as-is (not auto-confirmed).
              Mark coaching as done when complete to proceed to assessment creation.
            </p>
            <button onClick={() => onMarkCoachingDone(proc)} disabled={actionLoading === proc.id} className="btn-primary">
              <CheckCircle2 className="h-4 w-4" /> {actionLoading === proc.id ? 'Updating…' : 'Mark Coaching Done'}
            </button>
          </div>
        )}
        {proc.status === 'pending_coaching_done' && isOperation && (
          <p className="text-sm text-slate-500">Waiting for coach to complete coaching session.</p>
        )}

        {/* Coach creates assessment with custom questions */}
        {proc.status === 'pending_assessment_create' && isCoach && (
          <div>
            <p className="mb-2 text-sm text-slate-600">Create a custom assessment form with questions for the agent. All question types are available.</p>
            <button onClick={() => setShowAssessmentBuilder(true)} className="btn-primary">
              <FileQuestion className="h-4 w-4" /> Create Assessment Form
            </button>
          </div>
        )}

        {/* Waiting for agent to submit assessment */}
        {proc.status === 'pending_assessment_submit' && (
          <div>
            <p className="mb-2 text-sm text-slate-600">Assessment has been sent to the agent. Waiting for agent submission.</p>
            {assessment && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs">
                <p><strong>{assessment.title}</strong> — {assessment.questions.length} question(s)</p>
                <p className="mt-1 text-slate-500">Status: {assessment.status === 'submitted' ? 'Agent has submitted' : 'Awaiting agent response'}</p>
                {assessment.status === 'submitted' && isCoach && (
                  <button onClick={() => setShowAssessmentReview(true)} className="btn-secondary mt-2 text-xs">
                    <Eye className="h-3.5 w-3.5" /> Review Agent Submission
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Coach reviews assessment result */}
        {proc.status === 'pending_assessment_review' && isCoach && assessment && (
          <div>
            <p className="mb-2 text-sm text-slate-600">Agent has submitted the assessment. Review and decide pass/fail.</p>
            <button onClick={() => setShowAssessmentReview(true)} className="btn-primary">
              <ClipboardCheck className="h-4 w-4" /> Review Assessment
            </button>
          </div>
        )}

        {/* Quality feedback — 24h lock */}
        {proc.status === 'pending_quality_feedback' && (
          <div>
            {qualityFeedbackLocked ? (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                <Lock className="h-4 w-4" />
                <span>Quality feedback request is locked for 24 hours after assessment pass. {qualityLockRemaining}</span>
              </div>
            ) : (
              <>
                <p className="mb-2 text-sm text-slate-600">Assessment passed. Request quality evaluation feedback (24h lock period has passed).</p>
                {isOperation && (
                  <button onClick={() => onRequestQualityFeedback(proc)} disabled={actionLoading === proc.id} className="btn-primary">
                    <Bell className="h-4 w-4" /> {actionLoading === proc.id ? 'Requesting…' : 'Request Quality Feedback'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Quality conducts inline evaluation */}
        {proc.status === 'pending_evaluation' && isQuality && (
          <div>
            <p className="mb-2 text-sm text-slate-600">
              Conduct the quality feedback evaluation directly here. No need to go to the evaluation page.
              Fill in the scorecard and remark based on the repeated failure form.
            </p>
            <button onClick={() => setShowInlineEval(true)} className="btn-primary">
              <FileText className="h-4 w-4" /> Conduct Inline Evaluation
            </button>
          </div>
        )}
        {proc.status === 'pending_evaluation' && !isQuality && (
          <p className="text-sm text-slate-500">Waiting for Quality to conduct the evaluation.</p>
        )}

        {/* Operation confirms process — PASS completes, FAIL escalates to cycle 2 */}
        {proc.status === 'pending_process_confirm' && isOperation && (
          <div>
            {proc.eval_pass_fail && (
              <div className={cls('mb-3 rounded-lg p-3 text-sm',
                proc.eval_pass_fail === 'Pass' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
                <p className="font-medium">Evaluation Result: {proc.eval_pass_fail} (Score: {proc.eval_call_score ?? '—'})</p>
                {proc.eval_remark && <p className="mt-1 text-xs">{proc.eval_remark}</p>}
                {proc.eval_pass_fail === 'Failed' && (
                  <p className="mt-2 text-xs font-medium">
                    Confirming will escalate this agent to {CYCLE_LABELS[(proc.cycle ?? 1) + 1] ?? 'next cycle'} (Training & Shadowing).
                  </p>
                )}
              </div>
            )}
            <button onClick={() => onConfirmProcess(proc)} disabled={actionLoading === proc.id} className="btn-primary">
              <CheckCircle2 className="h-4 w-4" /> {actionLoading === proc.id ? 'Confirming…' :
                proc.eval_pass_fail === 'Pass' ? 'Confirm & Complete Process' :
                'Confirm & Escalate to Next Cycle'}
            </button>
          </div>
        )}

        {/* Manager action (cycle 3) */}
        {proc.status === 'pending_manager_action' && isManager && (
          <div>
            <p className="mb-2 text-sm text-slate-600">Take appropriate action for this agent.</p>
            <button onClick={() => setShowManagerAction(true)} className="btn-primary">
              <Shield className="h-4 w-4" /> Add Manager Action
            </button>
          </div>
        )}

        {proc.status === 'pending_manager_confirm' && isOperation && (
          <div>
            <p className="mb-2 text-sm text-slate-600">Manager action: <strong>{proc.manager_action ?? '—'}</strong></p>
            {proc.manager_feedback && <p className="mb-2 text-sm text-slate-500">Feedback: {proc.manager_feedback}</p>}
            <button onClick={() => onConfirmProcess(proc)} disabled={actionLoading === proc.id} className="btn-primary">
              <CheckCircle2 className="h-4 w-4" /> {actionLoading === proc.id ? 'Confirming…' : 'Confirm & Complete'}
            </button>
          </div>
        )}

        {/* Assessment result display */}
        {proc.assessment_passed != null && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Award className="h-4 w-4 text-brand-600" />
            <span className="text-slate-600">Assessment: <strong className={proc.assessment_passed ? 'text-emerald-600' : 'text-rose-600'}>{proc.assessment_passed ? 'Passed' : 'Failed'}</strong> (Score: {proc.assessment_score ?? '—'})</span>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAssessmentBuilder && (
        <AssessmentBuilderModal
          onClose={() => setShowAssessmentBuilder(false)}
          onSend={(questions, title) => { onSendAssessment(proc, questions, title); setShowAssessmentBuilder(false); }}
        />
      )}
      {showAssessmentReview && assessment && (
        <AssessmentReviewModal
          assessment={assessment}
          onClose={() => setShowAssessmentReview(false)}
          onReview={(passed, score) => { onReviewAssessment(proc, passed, score); setShowAssessmentReview(false); }}
        />
      )}
      {showManagerAction && (
        <ManagerActionModal
          action={managerAction}
          feedback={managerFeedback}
          onActionChange={setManagerAction}
          onFeedbackChange={setManagerFeedback}
          onClose={() => setShowManagerAction(false)}
          onSubmit={() => { onManagerAction(proc, managerAction, managerFeedback); setShowManagerAction(false); }}
        />
      )}
      {showInlineEval && (
        <InlineEvaluationModal
          proc={proc}
          evaluations={evaluations}
          onClose={() => setShowInlineEval(false)}
          onSubmit={(score, passFail, checklist, remark) => { onInlineEvaluation(proc, score, passFail, checklist, remark); setShowInlineEval(false); }}
        />
      )}
    </div>
  );
}

// ====== Assessment Builder Modal ======
function AssessmentBuilderModal({ onClose, onSend }: {
  onClose: () => void;
  onSend: (questions: RFAssessmentQuestion[], title: string) => void;
}) {
  const [title, setTitle] = useState('Repeated Failure Assessment');
  const [questions, setQuestions] = useState<RFAssessmentQuestion[]>([
    { id: `q_${Date.now()}`, type: 'multiple_choice', question: '', options: ['', ''], correct_answer: null, points: 1 },
  ]);

  const addQuestion = () => {
    setQuestions((prev) => [...prev, {
      id: `q_${Date.now()}_${prev.length}`, type: 'multiple_choice',
      question: '', options: ['', ''], correct_answer: null, points: 1,
    }]);
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const updateQuestion = (id: string, patch: Partial<RFAssessmentQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const addOption = (qId: string) => {
    setQuestions((prev) => prev.map((q) => q.id === qId ? { ...q, options: [...q.options, ''] } : q));
  };

  const updateOption = (qId: string, idx: number, val: string) => {
    setQuestions((prev) => prev.map((q) => q.id === qId ? { ...q, options: q.options.map((o, i) => i === idx ? val : o) } : q));
  };

  const removeOption = (qId: string, idx: number) => {
    setQuestions((prev) => prev.map((q) => q.id === qId ? { ...q, options: q.options.filter((_, i) => i !== idx) } : q));
  };

  const QUESTION_TYPES = [
    { value: 'multiple_choice', label: 'Multiple Choice' },
    { value: 'true_false', label: 'True / False' },
    { value: 'short_answer', label: 'Short Answer' },
    { value: 'long_answer', label: 'Long Answer' },
    { value: 'rating', label: 'Rating (1-5)' },
    { value: 'checkbox', label: 'Checkbox List' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Create Assessment Form</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Assessment Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </div>

          {questions.map((q, qi) => (
            <div key={q.id} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Question {qi + 1}</span>
                <button onClick={() => removeQuestion(q.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Question Type</label>
                  <select value={q.type} onChange={(e) => updateQuestion(q.id, { type: e.target.value as RFAssessmentQuestion['type'] })} className="input">
                    {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Points</label>
                  <input type="number" min={1} value={q.points} onChange={(e) => updateQuestion(q.id, { points: Number(e.target.value) })} className="input" />
                </div>
              </div>
              <div className="mt-3">
                <label className="label">Question Text</label>
                <input value={q.question} onChange={(e) => updateQuestion(q.id, { question: e.target.value })} placeholder="Enter your question…" className="input" />
              </div>

              {(q.type === 'multiple_choice' || q.type === 'checkbox') && (
                <div className="mt-3">
                  <label className="label">Options</label>
                  <div className="space-y-2">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <input value={opt} onChange={(e) => updateOption(q.id, oi, e.target.value)} placeholder={`Option ${oi + 1}`} className="input flex-1" />
                        {q.options.length > 2 && <button onClick={() => removeOption(q.id, oi)} className="text-rose-400 hover:text-rose-600"><X className="h-4 w-4" /></button>}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => addOption(q.id)} className="btn-ghost mt-2 text-xs"><Plus className="h-3.5 w-3.5" /> Add Option</button>
                </div>
              )}

              {q.type === 'true_false' && (
                <div className="mt-3">
                  <label className="label">Correct Answer</label>
                  <select value={q.correct_answer ?? ''} onChange={(e) => updateQuestion(q.id, { correct_answer: e.target.value })} className="input">
                    <option value="">No correct answer (coach will review)</option>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                </div>
              )}

              {q.type === 'multiple_choice' && (
                <div className="mt-3">
                  <label className="label">Correct Answer (optional — for auto-scoring)</label>
                  <select value={q.correct_answer ?? ''} onChange={(e) => updateQuestion(q.id, { correct_answer: e.target.value })} className="input">
                    <option value="">No correct answer (coach will review)</option>
                    {q.options.filter(Boolean).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}

          <button onClick={addQuestion} className="btn-secondary w-full"><Plus className="h-4 w-4" /> Add Question</button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={() => onSend(questions.filter((q) => q.question.trim()), title)}
            disabled={questions.filter((q) => q.question.trim()).length === 0}
            className="btn-primary"
          >
            <Send className="h-4 w-4" /> Send Assessment to Agent
          </button>
        </div>
      </div>
    </div>
  );
}

// ====== Assessment Review Modal ======
function AssessmentReviewModal({ assessment, onClose, onReview }: {
  assessment: RFAssessment;
  onClose: () => void;
  onReview: (passed: boolean, score: number) => void;
}) {
  const [score, setScore] = useState(assessment.agent_score ?? 0);
  const [passed, setPassed] = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Review Assessment — {assessment.title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          {assessment.questions.map((q, qi) => {
            const agentAnswer = assessment.agent_answers?.[q.id];
            return (
              <div key={q.id} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-700">Q{qi + 1}: {q.question}</p>
                <p className="mt-1 text-xs text-slate-400">Type: {q.type} · Points: {q.points}</p>
                {q.options.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {q.options.map((opt) => (
                      <span key={opt} className={cls('rounded px-2 py-0.5 text-xs',
                        opt === agentAnswer ? 'bg-brand-50 text-brand-700 font-medium' : 'bg-slate-100 text-slate-500')}>{opt}</span>
                    ))}
                  </div>
                )}
                {agentAnswer && q.type !== 'multiple_choice' && q.type !== 'checkbox' && (
                  <p className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-700">Agent answer: {String(agentAnswer)}</p>
                )}
                {q.correct_answer && (
                  <p className="mt-1 text-xs text-emerald-600">Correct answer: {q.correct_answer}</p>
                )}
              </div>
            );
          })}
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Submitted at: {assessment.agent_submitted_at ? fmtDateTime(assessment.agent_submitted_at) : '—'}</p>
          </div>
          <div>
            <label className="label">Score</label>
            <input type="number" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} className="input" />
          </div>
          <div>
            <label className="label">Result</label>
            <div className="flex gap-2">
              <button onClick={() => setPassed(true)} className={cls('rounded-lg px-4 py-2 text-sm font-medium', passed ? 'bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200' : 'bg-slate-50 text-slate-500')}>Pass</button>
              <button onClick={() => setPassed(false)} className={cls('rounded-lg px-4 py-2 text-sm font-medium', !passed ? 'bg-rose-50 text-rose-700 ring-2 ring-rose-200' : 'bg-slate-50 text-slate-500')}>Fail</button>
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => onReview(passed, score)} className="btn-primary">
            <Send className="h-4 w-4" /> Submit Review
          </button>
        </div>
      </div>
    </div>
  );
}

// ====== Manager Action Modal ======
function ManagerActionModal({ action, feedback, onActionChange, onFeedbackChange, onClose, onSubmit }: {
  action: string;
  feedback: string;
  onActionChange: (v: string) => void;
  onFeedbackChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Manager Action</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">Action Taken</label>
            <input value={action} onChange={(e) => onActionChange(e.target.value)} placeholder="e.g. Final warning, Performance plan…" className="input" />
          </div>
          <div>
            <label className="label">Feedback</label>
            <textarea value={feedback} onChange={(e) => onFeedbackChange(e.target.value)} rows={3} className="input" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={onSubmit} disabled={!action.trim()} className="btn-primary"><Send className="h-4 w-4" /> Submit</button>
        </div>
      </div>
    </div>
  );
}

// ====== Inline Evaluation Modal ======
function InlineEvaluationModal({ proc, evaluations, onClose, onSubmit }: {
  proc: RFPRow;
  evaluations: EvalWithAgent[];
  onClose: () => void;
  onSubmit: (score: number, passFail: string, checklist: ChecklistItem[], remark: string) => void;
}) {
  // Build a simple checklist based on the trigger categories
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() => {
    const items: ChecklistItem[] = [];
    const triggerCats = proc.trigger_categories ?? [];
    const seenLabels = new Set<string>();

    // Pull failed attributes from the trigger evaluations
    for (const ev of evaluations) {
      if (!proc.trigger_evaluation_ids?.includes(ev.id)) continue;
      for (const item of (ev.checklist ?? []) as ChecklistItem[]) {
        if (item.answer === 'No' && !seenLabels.has(item.label)) {
          seenLabels.add(item.label);
          items.push({ ...item, answer: null, comment: '' });
        }
      }
    }

    // If no items found, create generic ones based on categories
    if (items.length === 0) {
      for (const cat of triggerCats) {
        items.push({
          id: `gen_${cat}`,
          label: `${cat} — Agent demonstrates correct behavior`,
          answer: null,
          comment: '',
          category: cat,
        });
      }
    }

    return items;
  });

  const [remark, setRemark] = useState('');
  const [callScore, setCallScore] = useState(0);

  // Compute score from checklist
  const computedScore = useMemo(() => {
    const answered = checklist.filter((i) => i.answer !== null);
    if (answered.length === 0) return 0;
    const yesCount = answered.filter((i) => i.answer === 'Yes').length;
    return Math.round((yesCount / answered.length) * 100);
  }, [checklist]);

  const passFail = computedScore >= 90 ? 'Pass' : 'Failed';

  const setAnswer = (id: string, answer: ChecklistItem['answer']) => {
    setChecklist((prev) => prev.map((i) => (i.id === id ? { ...i, answer } : i)));
  };

  const setComment = (id: string, comment: string) => {
    setChecklist((prev) => prev.map((i) => (i.id === id ? { ...i, comment } : i)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Quality Feedback Evaluation</h2>
            <p className="text-xs text-slate-500">Agent: {proc.agent?.agent_name ?? '—'} · {CYCLE_LABELS[proc.cycle] ?? ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        {/* Score display */}
        <div className="mb-4 flex items-center justify-between rounded-lg bg-slate-50 p-3">
          <div>
            <span className="text-2xl font-bold tabular-nums text-slate-900">{computedScore}</span>
            <span className="ml-1 text-sm text-slate-500">/ 100</span>
          </div>
          <span className={passFail === 'Pass' ? 'badge-pass' : 'badge-fail'}>{passFail}</span>
        </div>

        {/* Checklist */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">Evaluation Scorecard</h3>
          <p className="text-xs text-slate-500">Based on the repeated failure trigger attributes. Mark whether the agent now demonstrates correct behavior.</p>
          {checklist.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700">{item.label}</p>
                  <p className="text-xs text-slate-400">{item.category}</p>
                </div>
                <div className="flex gap-1">
                  {(['Yes', 'No', 'N/A'] as const).map((ans) => (
                    <button
                      key={ans}
                      onClick={() => setAnswer(item.id, ans)}
                      className={cls('rounded px-3 py-1 text-xs font-medium',
                        item.answer === ans
                          ? ans === 'Yes' ? 'bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200'
                          : ans === 'No' ? 'bg-rose-50 text-rose-700 ring-2 ring-rose-200'
                          : 'bg-slate-100 text-slate-600 ring-2 ring-slate-300'
                        : 'bg-slate-50 text-slate-400 hover:bg-slate-100')}
                    >
                      {ans}
                    </button>
                  ))}
                </div>
              </div>
              {item.answer === 'No' && (
                <input
                  placeholder="Add comment for this failure…"
                  value={item.comment}
                  onChange={(e) => setComment(item.id, e.target.value)}
                  className="input mt-2 text-sm"
                />
              )}
            </div>
          ))}
        </div>

        {/* Remark */}
        <div className="mt-4">
          <label className="label">Overall Remark (based on repeated failure form)</label>
          <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} className="input" placeholder="Provide overall feedback on the agent's improvement…" />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={() => onSubmit(computedScore, passFail, checklist, remark)}
            disabled={checklist.filter((i) => i.answer !== null).length === 0}
            className="btn-primary"
          >
            <Save className="h-4 w-4" /> Submit Evaluation
          </button>
        </div>
      </div>
    </div>
  );
}

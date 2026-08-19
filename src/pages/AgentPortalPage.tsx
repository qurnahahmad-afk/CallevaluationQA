import { useEffect, useMemo, useState } from 'react';
import {
  Bell, ClipboardList, GraduationCap, CheckCircle2, X, Save, MessageSquare,
  Award, TrendingUp, AlertTriangle, ChevronRight, AlertCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { navigate } from '../lib/router';
import { cls, fmtDate, fmtDateTime } from '../lib/utils';
import { computeScore } from '../lib/scorecard';
import { PageHeader, LoadingState, ErrorState, EmptyState, ScoreBadge } from '../components/ui';
import { useL } from '../lib/labels';
import type { Evaluation, Agent, CoachingSession, Notification, FormConfig } from '../types';

type AgentEval = Evaluation & {
  agent?: Pick<Agent, 'id' | 'agent_name' | 'lob' | 'team_leader' | 'coach_name' | 'manager_name'> | null;
  project?: { id: string; name: string } | null;
};

type AgentCoaching = CoachingSession & {
  agent?: Pick<Agent, 'id' | 'agent_name'> | null;
  evaluation?: Pick<Evaluation, 'id' | 'call_score' | 'pass_fail' | 'evaluation_date'> | null;
};

export function AgentPortalPage() {
  const { profile } = useAuth();
  const L = useL();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [evaluations, setEvaluations] = useState<AgentEval[]>([]);
  const [coaching, setCoaching] = useState<AgentCoaching[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'evaluations' | 'coaching' | 'notifications'>('evaluations');
  const [feedbackSession, setFeedbackSession] = useState<AgentCoaching | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!profile) return;
      // Find agent record linked to this user's email
      const { data: agentData } = await supabase
        .from('agents')
        .select('*')
        .eq('email', profile.email)
        .maybeSingle();
      if (!active) return;
      setAgent(agentData as Agent | null);

      if (agentData) {
        const { data: evals } = await supabase
          .from('evaluations')
          .select('*, agent:agents(id, agent_name, lob, team_leader, coach_name, manager_name), project:projects(id, name)')
          .eq('agent_id', (agentData as Agent).id)
          .order('created_at', { ascending: false });
        const { data: coach } = await supabase
          .from('coaching_sessions')
          .select('*, agent:agents(id, agent_name), evaluation:evaluations(id, call_score, pass_fail, evaluation_date)')
          .eq('agent_id', (agentData as Agent).id)
          .order('created_at', { ascending: false });
        if (active) {
          setEvaluations((evals ?? []) as AgentEval[]);
          setCoaching((coach ?? []) as AgentCoaching[]);
        }
      }

      const { data: notifs } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });
      if (active) setNotifications((notifs ?? []) as Notification[]);

      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [profile]);

  const stats = useMemo(() => {
    const total = evaluations.length;
    const avgScore = total > 0 ? Math.round(evaluations.reduce((s, e) => s + (e.call_score ?? 0), 0) / total) : 0;
    const passed = evaluations.filter((e) => e.pass_fail === 'Pass').length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    const unreadNotifs = notifications.filter((n) => !n.read).length;
    const pendingCoaching = coaching.filter((c) => c.status === 'conducted' && !c.agent_confirmation).length;
    return { total, avgScore, passRate, unreadNotifs, pendingCoaching };
  }, [evaluations, notifications, coaching]);

  const commonMistakes = useMemo(() => {
    const errorMap = new Map<string, number>();
    for (const ev of evaluations) {
      for (const item of (ev.checklist ?? [])) {
        if (item.answer === 'No') {
          errorMap.set(item.label, (errorMap.get(item.label) ?? 0) + 1);
        }
      }
    }
    return Array.from(errorMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [evaluations]);

  const markNotificationRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const saveAgentFeedback = async (session: AgentCoaching, confirmation: string, notes: string) => {
    const { data, error } = await supabase
      .from('coaching_sessions')
      .update({ agent_confirmation: confirmation, agent_notes: notes })
      .eq('id', session.id)
      .select('*, agent:agents(id, agent_name), evaluation:evaluations(id, call_score, pass_fail, evaluation_date)')
      .single();
    if (error) return;
    setCoaching((prev) => prev.map((c) => (c.id === session.id ? (data as AgentCoaching) : c)));
    setFeedbackSession(null);
  };

  if (loading) return <LoadingState label="Loading your portal…" />;
  if (error) return <ErrorState message={error} />;
  if (!agent) return (
    <EmptyState
      icon={<AlertCircle className="h-10 w-10" />}
      title="No agent profile linked"
      subtitle="Your account is not linked to an agent record. Please contact your administrator."
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader title={L('page.agent_portal', 'My Portal')} subtitle={`${agent.agent_name} · ${agent.lob ?? '—'}`} />

      {/* Agent Info Bar */}
      <div className="card grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <InfoItem label="Coach" value={agent.coach_name ?? '—'} />
        <InfoItem label="Team Leader" value={agent.team_leader ?? '—'} />
        <InfoItem label="Manager" value={agent.manager_name ?? '—'} />
        <InfoItem label="LOB" value={agent.lob ?? '—'} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<ClipboardList className="h-5 w-5" />} label="My Evaluations" value={String(stats.total)} tone="brand" />
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Average Score" value={String(stats.avgScore)} tone="amber" />
        <StatCard icon={<Award className="h-5 w-5" />} label="Pass Rate" value={`${stats.passRate}%`} tone="emerald" />
        <StatCard icon={<Bell className="h-5 w-5" />} label="Notifications" value={String(stats.unreadNotifs)} tone="rose" sub="unread" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {([
          { key: 'evaluations', label: 'My Evaluations', icon: ClipboardList },
          { key: 'coaching', label: 'My Coaching', icon: GraduationCap, badge: stats.pendingCoaching },
          { key: 'notifications', label: 'Notifications', icon: Bell, badge: stats.unreadNotifs },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cls(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === t.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {'badge' in t && t.badge ? (
              <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-xs font-semibold text-rose-700">{t.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Evaluations Tab */}
      {tab === 'evaluations' && (
        <div className="space-y-4">
          {/* Common Mistakes */}
          {commonMistakes.length > 0 && (
            <div className="card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <AlertTriangle className="h-4 w-4 text-rose-600" /> My Common Mistakes
              </h3>
              <div className="space-y-2">
                {commonMistakes.map((m, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-rose-50 p-2.5">
                    <span className="text-sm text-slate-700">{m.label}</span>
                    <span className="text-sm font-semibold text-rose-600">{m.count}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evaluations List */}
          {evaluations.length === 0 ? (
            <EmptyState icon={<ClipboardList className="h-10 w-10" />} title="No evaluations" subtitle="Your evaluations will appear here" />
          ) : (
            <div className="card divide-y divide-slate-100">
              {evaluations.map((ev) => (
                <button
                  key={ev.id}
                  onClick={() => navigate({ name: 'evaluation', id: ev.id })}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-700">{fmtDateTime(ev.evaluation_date)}</div>
                    <div className="text-xs text-slate-400">{ev.project?.name ?? '—'} · {ev.task_type ?? '—'}</div>
                  </div>
                  <ScoreBadge score={ev.call_score} passFail={ev.pass_fail} />
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Coaching Tab */}
      {tab === 'coaching' && (
        <div className="space-y-4">
          {coaching.length === 0 ? (
            <EmptyState icon={<GraduationCap className="h-10 w-10" />} title="No coaching sessions" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {coaching.map((s) => (
                <div key={s.id} className="card p-5">
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-700">Coaching Session</div>
                      <div className="text-xs text-slate-400">{fmtDate(s.scheduled_date ?? s.created_at)}</div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>

                  {s.evaluation && (
                    <div className="mb-2 text-xs text-slate-500">
                      Eval Score: <span className="font-semibold text-slate-700">{s.evaluation.call_score}</span> ({s.evaluation.pass_fail})
                    </div>
                  )}

                  {s.notes && (
                    <div className="mb-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">{s.notes}</div>
                  )}
                  {s.strength_points && (
                    <div className="mb-1 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">
                      <strong>Strengths:</strong> {s.strength_points}
                    </div>
                  )}
                  {s.improvement_points && (
                    <div className="mb-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                      <strong>Improvement:</strong> {s.improvement_points}
                    </div>
                  )}
                  {s.action_points && (
                    <div className="mb-1 rounded-lg bg-blue-50 p-2 text-xs text-blue-700">
                      <strong>Actions:</strong> {s.action_points}
                    </div>
                  )}
                  {s.agent_confirmation && (
                    <div className="mb-1 rounded-lg bg-slate-100 p-2 text-xs text-slate-600">
                      <strong>Your confirmation:</strong> {s.agent_confirmation}
                    </div>
                  )}
                  {s.agent_notes && (
                    <div className="mb-1 rounded-lg bg-slate-100 p-2 text-xs text-slate-600">
                      <strong>Your notes:</strong> {s.agent_notes}
                    </div>
                  )}

                  {s.status === 'conducted' && !s.agent_confirmation && (
                    <button onClick={() => setFeedbackSession(s)} className="btn-primary mt-3 w-full text-sm">
                      <MessageSquare className="h-4 w-4" /> Add Feedback
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notifications Tab */}
      {tab === 'notifications' && (
        <div className="card divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <EmptyState icon={<Bell className="h-10 w-10" />} title="No notifications" />
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={cls('flex items-start gap-3 p-4', !n.read && 'bg-brand-50/50')}
              >
                <div className={cls('mt-1 h-2 w-2 rounded-full', n.read ? 'bg-slate-300' : 'bg-brand-600')} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-700">{n.title}</div>
                  {n.message && <div className="text-xs text-slate-500">{n.message}</div>}
                  <div className="mt-1 text-xs text-slate-400">{fmtDateTime(n.created_at)}</div>
                </div>
                {!n.read && (
                  <button onClick={() => markNotificationRead(n.id)} className="text-xs text-brand-600 hover:underline">
                    Mark read
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {feedbackSession && (
        <AgentFeedbackModal
          session={feedbackSession}
          onClose={() => setFeedbackSession(null)}
          onSave={saveAgentFeedback}
        />
      )}
    </div>
  );
}

function AgentFeedbackModal({ session, onClose, onSave }: {
  session: AgentCoaching;
  onClose: () => void;
  onSave: (s: AgentCoaching, confirmation: string, notes: string) => void;
}) {
  const [confirmation, setConfirmation] = useState(session.agent_confirmation ?? '');
  const [notes, setNotes] = useState(session.agent_notes ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    onSave(session, confirmation, notes);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Coaching Feedback</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Confirmation</label>
            <div className="flex gap-2">
              {['Confirmed', 'Need Discussion', 'Disagree'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => setConfirmation(opt)}
                  className={cls(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition',
                    confirmation === opt ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Notes / Comments</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="input" placeholder="Add your comments after reviewing the coaching feedback…" />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving || !confirmation} className="btn-primary">
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Submit Feedback'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone: 'brand' | 'amber' | 'emerald' | 'rose' }) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
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

function StatusBadge({ status }: { status: string }) {
  if (status === 'confirmed') return <span className="badge-pass"><CheckCircle2 className="h-3 w-3" /> Confirmed</span>;
  if (status === 'conducted') return <span className="badge bg-blue-50 text-blue-700 ring-1 ring-blue-200">Conducted</span>;
  return <span className="badge bg-amber-50 text-amber-700 ring-1 ring-amber-200">Pending</span>;
}

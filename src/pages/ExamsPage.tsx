import { useEffect, useState, useCallback } from 'react';
import { Plus, FileText, Play, Clock, CheckCircle2, XCircle, Award, Trash2, Edit3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useProjects } from '../lib/hooks';
import { fmtDate } from '../lib/utils';
import { PageHeader, EmptyState, LoadingState } from '../components/ui';
import type { Exam, ExamAttempt, ExamQuestion, Profile, Project } from '../types';

const Q_TYPES: ExamQuestion['type'][] = ['multiple_choice', 'single_choice', 'true_false', 'yes_no', 'short_answer', 'numeric', 'rating'];

export function ExamsPage() {
  const { profile, hasPermission } = useAuth();
  const { projects } = useProjects();
  const [exams, setExams] = useState<Exam[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'exams' | 'attempts'>('exams');
  const [modal, setModal] = useState<'create' | 'edit' | 'take' | null>(null);
  const [editExam, setEditExam] = useState<Exam | null>(null);
  const [takeExam, setTakeExam] = useState<Exam | null>(null);
  const canManage = hasPermission('manage_exams');

  const load = useCallback(async () => {
    const [e, a, p] = await Promise.all([
      supabase.from('exams').select('*').order('created_at', { ascending: false }),
      supabase.from('exam_attempts').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('active', true).order('full_name'),
    ]);
    setExams((e.data ?? []) as Exam[]);
    setAttempts((a.data ?? []) as ExamAttempt[]);
    setProfiles((p.data ?? []) as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingState />;
  if (!hasPermission('view_exams')) return <EmptyState title="Access denied" subtitle="You do not have permission to view exams." />;

  const myAttempts = attempts.filter((a) => a.user_id === profile?.id);
  const publishedExams = exams.filter((e) => e.status === 'published');
  const myAssigned = publishedExams.filter((e) => e.assigned_to?.includes(profile?.id ?? ''));

  return (
    <div>
      <PageHeader
        title="Monthly Exams"
        subtitle="Create exams, assign to agents, and track results"
        actions={canManage && (
          <button onClick={() => { setEditExam(null); setModal('create'); }} className="btn-primary">
            <Plus className="h-4 w-4" /> Create Exam
          </button>
        )}
      />

      <div className="mb-5 flex gap-2">
        <button onClick={() => setTab('exams')} className={tab === 'exams' ? 'btn-primary' : 'btn-secondary'}>Exams</button>
        <button onClick={() => setTab('attempts')} className={tab === 'attempts' ? 'btn-primary' : 'btn-secondary'}>My Attempts</button>
      </div>

      {tab === 'exams' && (
        <div className="space-y-3">
          {exams.length === 0 && <EmptyState icon={<FileText className="h-12 w-12" />} title="No exams yet" subtitle="Create your first exam to get started" />}
          {exams.map((exam) => {
            const examAttempts = attempts.filter((a) => a.exam_id === exam.id);
            const passCount = examAttempts.filter((a) => a.passed).length;
            const proj = projects.find((p) => p.id === exam.project_id);
            return (
              <div key={exam.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">{exam.title}</h3>
                      <span className={exam.status === 'published' ? 'badge-pass' : exam.status === 'archived' ? 'badge-neutral' : 'badge-warning'}>{exam.status}</span>
                    </div>
                    {exam.description && <p className="mt-1 text-sm text-slate-500">{exam.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                      <span>{exam.questions.length} questions</span>
                      <span>Pass: {exam.passing_score}%</span>
                      {proj && <span>{proj.name}</span>}
                      <span>{examAttempts.length} attempts ({passCount} passed)</span>
                      <span>Created {fmtDate(exam.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {exam.status === 'published' && exam.assigned_to?.includes(profile?.id ?? '') && (
                      <button onClick={() => { setTakeExam(exam); setModal('take'); }} className="btn-primary text-sm">
                        <Play className="h-4 w-4" /> Take Exam
                      </button>
                    )}
                    {canManage && (
                      <>
                        <button onClick={() => { setEditExam(exam); setModal('edit'); }} className="btn-secondary text-sm"><Edit3 className="h-4 w-4" /></button>
                        <button onClick={async () => { if (confirm('Delete this exam?')) { await supabase.from('exams').delete().eq('id', exam.id); void load(); } }} className="btn-secondary text-sm text-danger-600"><Trash2 className="h-4 w-4" /></button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'attempts' && (
        <div className="space-y-3">
          {myAttempts.length === 0 && <EmptyState icon={<Award className="h-12 w-12" />} title="No attempts yet" subtitle="Take an exam to see your results here" />}
          {myAttempts.map((att) => {
            const exam = exams.find((e) => e.id === att.exam_id);
            return (
              <div key={att.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">{exam?.title ?? 'Unknown exam'}</h3>
                    <div className="mt-1 text-xs text-slate-400">Submitted {fmtDate(att.submitted_at)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-slate-900">{Math.round(att.score)}%</div>
                    {att.passed ? <span className="badge-pass"><CheckCircle2 className="mr-1 h-3 w-3" /> Passed</span> : <span className="badge-fail"><XCircle className="mr-1 h-3 w-3" /> Failed</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal === 'create' && <ExamModal onClose={() => { setModal(null); void load(); }} projects={projects} profiles={profiles} />}
      {modal === 'edit' && editExam && <ExamModal onClose={() => { setModal(null); void load(); }} projects={projects} profiles={profiles} existing={editExam} />}
      {modal === 'take' && takeExam && <TakeExamModal exam={takeExam} onClose={() => { setModal(null); void load(); }} userId={profile?.id ?? ''} />}
    </div>
  );
}

function ExamModal({ onClose, projects, profiles, existing }: { onClose: () => void; projects: Project[]; profiles: Profile[]; existing?: Exam }) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [projectId, setProjectId] = useState(existing?.project_id ?? '');
  const [passingScore, setPassingScore] = useState(existing?.passing_score ?? 90);
  const [questions, setQuestions] = useState<ExamQuestion[]>(existing?.questions ?? []);
  const [assignedTo, setAssignedTo] = useState<string[]>(existing?.assigned_to ?? []);
  const [status, setStatus] = useState(existing?.status ?? 'draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addQuestion = () => setQuestions([...questions, { type: 'multiple_choice', question: '', options: ['', '', '', ''], correct_answer: null, points: 1 }]);
  const updateQ = (i: number, patch: Partial<ExamQuestion>) => setQuestions(questions.map((q, j) => j === i ? { ...q, ...patch } : q));
  const removeQ = (i: number) => setQuestions(questions.filter((_, j) => j !== i));

  const save = async () => {
    setError(null);
    if (!title.trim()) { setError('Title is required'); return; }
    if (questions.length === 0) { setError('At least one question is required'); return; }
    setSaving(true);
    const payload = {
      title, description: description || null,
      project_id: projectId || null,
      passing_score: passingScore,
      questions, assigned_to: assignedTo,
      status,
      updated_at: new Date().toISOString(),
    };
    const { error: e } = existing
      ? await supabase.from('exams').update(payload).eq('id', existing.id)
      : await supabase.from('exams').insert({ ...payload, created_by: null });
    setSaving(false);
    if (e) { setError(e.message); return; }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-xl font-bold text-slate-900">{existing ? 'Edit Exam' : 'Create Exam'}</h2>
        {error && <div className="mb-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</div>}
        <div className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Exam title" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Project</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
                <option value="">All Projects</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Passing Score (%)</label>
              <input type="number" value={passingScore} onChange={(e) => setPassingScore(Number(e.target.value))} className="input" min={0} max={100} />
            </div>
          </div>
          <div>
            <label className="label">Assign To (Agents)</label>
            <div className="max-h-32 overflow-y-auto space-y-1 rounded-lg border border-slate-200 p-2">
              {profiles.filter((p) => p.role === 'agent').map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={assignedTo.includes(p.id)} onChange={(e) => setAssignedTo(e.target.checked ? [...assignedTo, p.id] : assignedTo.filter((x) => x !== p.id))} />
                  {p.full_name}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label">Questions</label>
              <button onClick={addQuestion} className="btn-secondary text-sm"><Plus className="h-4 w-4" /> Add Question</button>
            </div>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start gap-2">
                    <select value={q.type} onChange={(e) => updateQ(i, { type: e.target.value as ExamQuestion['type'], correct_answer: null })} className="input w-auto text-sm">
                      {Q_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                    </select>
                    <input value={q.question} onChange={(e) => updateQ(i, { question: e.target.value })} className="input flex-1 text-sm" placeholder="Question text" />
                    <input type="number" value={q.points} onChange={(e) => updateQ(i, { points: Number(e.target.value) })} className="input w-16 text-sm" min={1} />
                    <button onClick={() => removeQ(i)} className="text-danger-500 hover:text-danger-700"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  {(q.type === 'multiple_choice' || q.type === 'single_choice') && (
                    <div className="mt-2 space-y-1">
                      {q.options.map((opt, j) => (
                        <div key={j} className="flex items-center gap-2">
                          <input value={opt} onChange={(e) => updateQ(i, { options: q.options.map((o, k) => k === j ? e.target.value : o) })} className="input flex-1 text-sm" placeholder={`Option ${j + 1}`} />
                          <input type="radio" name={`correct-${i}`} checked={q.correct_answer === opt} onChange={() => updateQ(i, { correct_answer: opt })} />
                        </div>
                      ))}
                    </div>
                  )}
                  {(q.type === 'true_false' || q.type === 'yes_no') && (
                    <div className="mt-2 flex gap-2">
                      {(['true', 'false'] as const).map((v) => (
                        <button key={v} onClick={() => updateQ(i, { correct_answer: v, options: ['true', 'false'] })} className={q.correct_answer === v ? 'btn-primary text-sm' : 'btn-secondary text-sm'}>{v}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as Exam['status'])} className="input w-auto">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save Exam'}</button>
        </div>
      </div>
    </div>
  );
}

function TakeExamModal({ exam, onClose, userId }: { exam: Exam; onClose: () => void; userId: string }) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    let score = 0;
    let maxScore = 0;
    exam.questions.forEach((q, i) => {
      maxScore += q.points;
      const ans = answers[String(i)];
      if (q.correct_answer && ans === q.correct_answer) score += q.points;
    });
    const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
    const passed = pct >= exam.passing_score;
    const { error } = await supabase.from('exam_attempts').insert({
      exam_id: exam.id,
      user_id: userId,
      answers,
      score: pct,
      max_score: 100,
      passed,
      submitted_at: new Date().toISOString(),
      status: 'submitted',
    });
    setSubmitting(false);
    if (error) { alert(error.message); return; }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-xl font-bold text-slate-900">{exam.title}</h2>
        <p className="mb-4 text-sm text-slate-500">Passing score: {exam.passing_score}%</p>
        <div className="space-y-4">
          {exam.questions.map((q, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 text-sm font-medium text-slate-800">{i + 1}. {q.question} <span className="text-xs text-slate-400">({q.points} pts)</span></div>
              {q.type === 'short_answer' && <input value={answers[String(i)] ?? ''} onChange={(e) => setAnswers({ ...answers, [String(i)]: e.target.value })} className="input" placeholder="Your answer" />}
              {q.type === 'numeric' && <input type="number" value={answers[String(i)] ?? ''} onChange={(e) => setAnswers({ ...answers, [String(i)]: e.target.value })} className="input" />}
              {q.type === 'rating' && (
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((r) => <button key={r} onClick={() => setAnswers({ ...answers, [String(i)]: String(r) })} className={answers[String(i)] === String(r) ? 'btn-primary text-sm' : 'btn-secondary text-sm'}>{r}</button>)}
                </div>
              )}
              {(q.type === 'multiple_choice' || q.type === 'single_choice' || q.type === 'true_false' || q.type === 'yes_no') && (
                <div className="space-y-1">
                  {(q.options.length > 0 ? q.options : ['true', 'false']).map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input type="radio" name={`q-${i}`} checked={answers[String(i)] === opt} onChange={() => setAnswers({ ...answers, [String(i)]: opt })} />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={submitting} className="btn-primary">{submitting ? 'Submitting…' : 'Submit Exam'}</button>
        </div>
      </div>
    </div>
  );
}

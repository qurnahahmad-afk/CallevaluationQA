import { useEffect, useState, useCallback } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, EmptyState, LoadingState } from '../components/ui';

export function AIAnalyticsPage() {
  const { hasPermission } = useAuth();
  const [evals, setEvals] = useState<Record<string, unknown>[]>([]);
  const [coaching, setCoaching] = useState<Record<string, unknown>[]>([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  const load = useCallback(async () => {
    const [e, c] = await Promise.all([
      supabase.from('evaluations').select('*').eq('pass_fail', 'Fail'),
      supabase.from('coaching_sessions').select('*').limit(200),
    ]);
    setEvals(e.data ?? []);
    setCoaching(c.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingState />;
  if (!hasPermission('view_ai_analytics')) return <EmptyState title="Access denied" subtitle="You do not have permission to view AI Analytics." />;

  const dataContext = {
    total_evaluations: evals.length,
    failed: evals.filter((e) => e.pass_fail === 'Fail').length,
    coaching_count: coaching.length,
    pending_coaching: coaching.filter((c) => c.status === 'pending' || c.status === 'scheduled').length,
  by_project: evals.reduce((acc: Record<string, number>, e) => {
      const name = String(e.project_id ?? 'unknown');
      acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    }, {}),
  };

  const suggestions = [
    'What are the top quality issues?',
    'What are the most common Customer Critical errors?',
    'Which agents have repeated failures?',
    'What are the main root causes of failures?',
    'What actions should we prioritize to improve quality?',
  ];

  const ask = async () => {
    if (!question.trim()) return;
    setAnalyzing(true);
    const prompt = `You are a Quality Management AI analyst for a contact center. Answer the user's question using ONLY the data provided. If data is insufficient, state "Insufficient data to determine a reliable conclusion."

Available data (JSON):
${JSON.stringify(dataContext, null, 2)}

User question: ${question}

Provide a structured, evidence-based answer. Distinguish between observed facts, potential root causes, and recommendations. Do not invent data.`;

    try {
      const { data } = await supabase.functions.invoke('ai-analytics', { body: { prompt } });
      setAnswer(typeof data === 'string' ? data : (data?.answer ?? JSON.stringify(data, null, 2)));
    } catch {
      setAnswer('AI analysis is currently unavailable. Based on the available data:\n\n' +
        `Total evaluations: ${dataContext.total_evaluations}\n` +
        `Failed evaluations: ${dataContext.failed}\n` +
        `Coaching sessions: ${dataContext.coaching_count}\n` +
        `Pending coaching: ${dataContext.pending_coaching}\n\n` +
        'To enable full AI analysis, configure an AI API key in the system settings.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title="AI Quality Analytics" subtitle="Ask questions about your quality data. Answers are evidence-based and grounded in real records." />

      <div className="card p-4">
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question about your quality data..." rows={3} className="input" />
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => setQuestion(s)} className="rounded-full bg-brand-50 px-3 py-1.5 text-xs text-brand-700 hover:bg-brand-100">{s}</button>
          ))}
        </div>
        <div className="mt-3">
          <button onClick={ask} disabled={analyzing || !question.trim()} className="btn-primary">
            {analyzing ? <><div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Analyzing...</> : <><Send className="h-4 w-4" /> Analyze</>}
          </button>
        </div>
      </div>

      {answer && (
        <div className="card mt-4 p-5">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-slate-800"><Sparkles className="h-4 w-4 text-brand-600" /> AI Analysis</h3>
          <div className="whitespace-pre-wrap text-sm text-slate-700">{answer}</div>
          <div className="mt-3 text-xs text-slate-400">Based on {evals.length} evaluations and {coaching.length} coaching records.</div>
        </div>
      )}
    </div>
  );
}

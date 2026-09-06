import { useEffect, useState, useCallback } from 'react';
import { Calculator as CalcIcon, BarChart3, History, Shuffle, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useProjects } from '../lib/hooks';
import { fmtDate } from '../lib/utils';
import { PageHeader, EmptyState, LoadingState } from '../components/ui';
import type { SampleSizeCalculation, RandomizationTransaction } from '../types';

export function SampleSizePage() {
  const { hasPermission } = useAuth();
  const { projects } = useProjects();
  const [calcs, setCalcs] = useState<SampleSizeCalculation[]>([]);
  const [transactions, setTransactions] = useState<RandomizationTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'calculator' | 'history' | 'monitoring'>('calculator');
  const [projectId, setProjectId] = useState('');
  const [population, setPopulation] = useState(1000);
  const [confidence, setConfidence] = useState(95);
  const [marginError, setMarginError] = useState(5);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [c, t] = await Promise.all([
      supabase.from('sample_size_calculations').select('*').order('created_at', { ascending: false }),
      supabase.from('randomization_transactions').select('*').order('created_at', { ascending: false }),
    ]);
    setCalcs((c.data ?? []) as SampleSizeCalculation[]);
    setTransactions((t.data ?? []) as RandomizationTransaction[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingState />;
  if (!hasPermission('view_sample_size')) return <EmptyState title="Access denied" subtitle="You do not have permission to view sample size." />;

  const zScore = confidence === 99 ? 2.576 : confidence === 95 ? 1.96 : 1.645;
  const p = 0.5;
  const sampleSize = Math.ceil((zScore * zScore * p * (1 - p)) / ((marginError / 100) * (marginError / 100)));

  const saveCalc = async () => {
    setSaving(true);
    await supabase.from('sample_size_calculations').insert({
      project_id: projectId || null,
      population_size: population,
      confidence_level: confidence,
      margin_error: marginError,
      calculated_size: sampleSize,
    });
    setSaving(false);
    void load();
  };

  return (
    <div>
      <PageHeader title="Sample Size Calculation" subtitle="Calculate sample sizes per project, randomize transactions, and monitor progress" />

      <div className="mb-5 flex gap-2">
        <button onClick={() => setTab('calculator')} className={tab === 'calculator' ? 'btn-primary' : 'btn-secondary'}><CalcIcon className="h-4 w-4" /> Calculator</button>
        <button onClick={() => setTab('history')} className={tab === 'history' ? 'btn-primary' : 'btn-secondary'}><History className="h-4 w-4" /> History</button>
        <button onClick={() => setTab('monitoring')} className={tab === 'monitoring' ? 'btn-primary' : 'btn-secondary'}><BarChart3 className="h-4 w-4" /> Monitoring</button>
      </div>

      {tab === 'calculator' && (
        <div className="card max-w-2xl p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Project</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
                <option value="">All Projects</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Population Size</label>
              <input type="number" value={population} onChange={(e) => setPopulation(Number(e.target.value))} className="input" min={1} />
            </div>
            <div>
              <label className="label">Confidence Level (%)</label>
              <select value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="input">
                <option value={90}>90%</option>
                <option value={95}>95%</option>
                <option value={99}>99%</option>
              </select>
            </div>
            <div>
              <label className="label">Margin of Error (%)</label>
              <input type="number" value={marginError} onChange={(e) => setMarginError(Number(e.target.value))} className="input" min={1} max={20} />
            </div>
          </div>
          <div className="mt-6 rounded-xl bg-brand-50 p-5 text-center">
            <div className="text-sm text-slate-500">Recommended Sample Size</div>
            <div className="text-4xl font-bold text-brand-700">{sampleSize}</div>
            <div className="mt-1 text-xs text-slate-400">Based on {population} population, {confidence}% confidence, {marginError}% margin</div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={saveCalc} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save Calculation'}</button>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {calcs.length === 0 && <EmptyState icon={<History className="h-12 w-12" />} title="No calculations yet" />}
          {calcs.map((c) => {
            const proj = projects.find((p) => p.id === c.project_id);
            return (
              <div key={c.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{proj?.name ?? 'All Projects'}</div>
                    <div className="text-xs text-slate-400">{fmtDate(c.created_at)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-brand-700">{c.calculated_size}</div>
                    <div className="text-xs text-slate-400">samples from {c.population_size} pop</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'monitoring' && (
        <div className="space-y-3">
          {transactions.length === 0 && <EmptyState icon={<TrendingUp className="h-12 w-12" />} title="No transactions yet" subtitle="Randomized transactions will appear here" />}
          {transactions.map((t) => {
            const proj = projects.find((p) => p.id === t.project_id);
            return (
              <div key={t.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{proj?.name ?? 'All Projects'}</div>
                    <div className="text-xs text-slate-400">{t.transaction_ids?.length ?? 0} transactions</div>
                  </div>
                  <span className={t.evaluated ? 'badge-pass' : 'badge-warning'}>{t.evaluated ? 'Evaluated' : 'Pending'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

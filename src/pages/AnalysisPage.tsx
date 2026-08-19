import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend, LineChart, Line, ReferenceLine,
} from 'recharts';
import {
  Download, FileJson, FileSpreadsheet, AlertTriangle, TrendingUp, Award,
  MessageSquare, BarChart3, Plus, X, Search, Lightbulb, GitBranch, Database,
  Fish, ListChecks, Sparkles, ChevronDown, ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { cls, downloadCSV, downloadJSON, downloadExcel } from '../lib/utils';
import { computeScore, TASK_TYPES } from '../lib/scorecard';
import { useRootCauses, useProjectTargets } from '../lib/hooks';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui';
import { useL } from '../lib/labels';
import type { Evaluation, Agent, Project, FormConfig, RootCause, CustomAnalysis, AnalysisSuggestion } from '../types';

type AnalysisRow = Evaluation & {
  agent?: Pick<Agent, 'id' | 'agent_name' | 'lob' | 'team_leader' | 'project_id'> | null;
  project?: Pick<Project, 'id' | 'name'> | null;
};

type ChecklistItem = {
  id: string;
  label: string;
  answer: 'Yes' | 'No' | 'N/A' | null;
  comment: string;
  category: string;
};

const PASS_COLOR = '#16a34a';
const FAIL_COLOR = '#dc2626';
const CUSTOMER_COLOR = '#10b981';
const BUSINESS_COLOR = '#3b82f6';
const COMPLIANCE_COLOR = '#f59e0b';
const NONCRIT_COLOR = '#6366f1';

const STOPWORDS = new Set([
  'about', 'because', 'should', 'would', 'could', 'customer', 'called', 'asking',
  'their', 'there', 'which', 'agent', 'check', 'verify', 'please', 'thank',
  'needs', 'issue', 'wrong', 'right', 'correct', 'incorrect', 'failed', 'error',
  'this', 'that', 'with', 'from', 'have', 'they', 'will', 'been', 'were',
  'more', 'than', 'also', 'only', 'some', 'such', 'very', 'what', 'when',
]);

const DATA_SOURCES = [
  { key: 'evaluations', label: 'Evaluations Details', icon: ClipboardIcon },
  { key: 'attributes', label: 'Attributes of Evaluation', icon: ListChecks },
  { key: 'coaching', label: 'Coaching', icon: Award },
  { key: 'calibration', label: 'Calibration', icon: GitBranch },
  { key: 'agent_performance', label: 'Agent Performance', icon: TrendingUp },
  { key: 'dashboards', label: 'Dashboards', icon: BarChart3 },
  { key: 'reports', label: 'Reports', icon: FileText },
];

function ClipboardIcon(props: { className?: string }) {
  return <ListChecks {...props} />;
}

// Import icons used in DATA_SOURCES
import { FileText } from 'lucide-react';

const ANALYSIS_METRICS = [
  { key: 'qa_comments', label: 'QA Comments', field: 'comment' },
  { key: 'coaching_feedback', label: 'Coaching Feedback', field: 'feedback_to_agent' },
  { key: 'customer_verbatim', label: 'Customer Verbatim', field: 'customer_verbatim' },
  { key: 'call_summary', label: 'Call Summary', field: 'call_summary' },
  { key: 'agent_notes', label: 'Agent Notes', field: 'agent_notes' },
  { key: 'calibration_notes', label: 'Calibration Notes', field: 'calibration_notes' },
];

const ANALYSIS_TYPES = [
  { key: 'common_keywords', label: 'Common Keywords', icon: Search },
  { key: 'trending_problems', label: 'Trending Problems', icon: TrendingUp },
  { key: 'root_cause', label: 'Root Cause Analysis', icon: GitBranch },
  { key: 'frequent_mistakes', label: 'Most Frequent Mistakes', icon: AlertTriangle },
];

type CustomChartConfig = {
  id: string;
  title: string;
  groupBy: 'agent' | 'lob' | 'task_type' | 'pass_fail' | 'month' | 'transaction_type';
  metric: 'avg_score' | 'count' | 'pass_rate' | 'customer_accuracy' | 'business_accuracy' | 'compliance_accuracy' | 'soft_accuracy';
  chartType: 'bar' | 'line' | 'pie' | 'table' | 'pareto' | 'fishbone';
  dataSource: string;
};

function ChartCard({ title, onExportCSV, onExportJSON, onExportExcel, children, exportLabel = 'CSV' }: {
  title: string;
  onExportCSV: () => void;
  onExportJSON?: () => void;
  onExportExcel?: () => void;
  exportLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <div className="flex items-center gap-1">
          <button onClick={onExportCSV} className="btn-ghost text-xs" title={`Export ${exportLabel}`}>
            <Download className="h-3.5 w-3.5" /> {exportLabel}
          </button>
          {onExportExcel && (
            <button onClick={onExportExcel} className="btn-ghost text-xs" title="Export Excel">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </button>
          )}
          {onExportJSON && (
            <button onClick={onExportJSON} className="btn-ghost text-xs" title="Export JSON">
              <FileJson className="h-3.5 w-3.5" /> JSON
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function LabeledPie({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} label={({ name, value }) => `${name}: ${value}`}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// Pareto Chart Component
function ParetoChart({ data, color = '#3b82f6' }: { data: { name: string; value: number }[]; color?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  let cumulative = 0;
  const paretoData = data.map((d) => {
    cumulative += d.value;
    return { ...d, cumulativePct: total > 0 ? Math.round((cumulative / total) * 100) : 0 };
  });

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={paretoData} margin={{ left: 20, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-15} textAnchor="end" height={70} interval={0} />
        <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} />
        <Tooltip />
        <Bar yAxisId="left" dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="cumulativePct" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Fishbone (Ishikawa) Diagram Component — HTML/CSS based for clarity
function FishboneDiagram({ categories }: { categories: { name: string; causes: { label: string; count: number }[] }[] }) {
  if (categories.length === 0) return null;
  const topCats = categories.filter((_, i) => i % 2 === 0);
  const bottomCats = categories.filter((_, i) => i % 2 === 1);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Top branches */}
        <div className="flex gap-4 pb-2">
          {topCats.map((cat) => (
            <div key={cat.name} className="flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">{cat.name}</p>
              <div className="space-y-1">
                {cat.causes.slice(0, 5).map((cause) => (
                  <div key={cause.label} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{cause.label.length > 30 ? cause.label.slice(0, 30) + '…' : cause.label}</span>
                    <span className="ml-2 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">{cause.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Spine */}
        <div className="relative my-2">
          <div className="h-1 rounded-full bg-gradient-to-r from-slate-300 via-slate-500 to-slate-700" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2">
            <div className="rounded-r-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white">
              Problem
            </div>
          </div>
        </div>

        {/* Bottom branches */}
        <div className="flex gap-4 pt-2">
          {bottomCats.map((cat) => (
            <div key={cat.name} className="flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">{cat.name}</p>
              <div className="space-y-1">
                {cat.causes.slice(0, 5).map((cause) => (
                  <div key={cause.label} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{cause.label.length > 30 ? cause.label.slice(0, 30) + '…' : cause.label}</span>
                    <span className="ml-2 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">{cause.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="mt-3 text-center text-xs text-slate-400">
          {categories.length} categories · {categories.reduce((s, c) => s + c.causes.length, 0)} root causes identified
        </div>
      </div>
    </div>
  );
}

export function AnalysisPage() {
  const { activeProjectId, projects } = useAuth();
  const L = useL();
  const { rootCauses } = useRootCauses();
  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [coachingRows, setCoachingRows] = useState<Record<string, unknown>[]>([]);
  const [calibrationRows, setCalibrationRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customCharts, setCustomCharts] = useState<CustomChartConfig[]>([]);
  const [suggestions, setSuggestions] = useState<AnalysisSuggestion[]>([]);
  const [showAddChart, setShowAddChart] = useState(false);
  const [activeTab, setActiveTab] = useState<'rootcause' | 'comments' | 'custom' | 'suggestions'>('rootcause');
  const [keywordSearch, setKeywordSearch] = useState('');

  // Checklist-based metric selection (checkboxes instead of dropdown)
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set(['qa_comments', 'coaching_feedback']));
  const [selectedAnalysisType, setSelectedAnalysisType] = useState<string>('common_keywords');

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from('evaluations')
        .select('*, agent:agents(id, agent_name, lob, team_leader, project_id), project:projects(id, name)')
        .order('created_at', { ascending: false })
        .limit(1000);
      const pid = filterProject || activeProjectId;
      if (pid) q = q.eq('project_id', pid);
      const { data, error: evalErr } = await q;
      if (evalErr) throw new Error(evalErr.message);
      setRows((data ?? []) as AnalysisRow[]);

      // Load coaching data
      let coachQ = supabase.from('coaching_sessions').select('*').order('created_at', { ascending: false }).limit(500);
      if (pid) coachQ = coachQ.eq('project_id', pid);
      const { data: coachData } = await coachQ;
      setCoachingRows((coachData as Record<string, unknown>[]) ?? []);

      // Load calibration data
      let calibQ = supabase.from('calibration_sessions').select('*').order('created_at', { ascending: false }).limit(500);
      if (pid) calibQ = calibQ.eq('project_id', pid);
      const { data: calibData } = await calibQ;
      setCalibrationRows((calibData as Record<string, unknown>[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, filterProject]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('custom_analyses').select('*').order('created_at', { ascending: false });
      if (data) {
        setCustomCharts((data as CustomAnalysis[]).map((ca) => ({
          id: ca.id, title: ca.name, groupBy: (ca.config as Record<string, string>).groupBy as CustomChartConfig['groupBy'],
          metric: (ca.config as Record<string, string>).metric as CustomChartConfig['metric'],
          chartType: ca.chart_type as CustomChartConfig['chartType'], dataSource: ca.data_source,
        })));
      }
      const { data: sugg } = await supabase.from('analysis_suggestions').select('*').order('name');
      if (sugg) setSuggestions(sugg as AnalysisSuggestion[]);
    })();
  }, []);

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

  // Collect all unique checklist items for selection
  const allChecklistItems = useMemo(() => {
    const map = new Map<string, { id: string; label: string; category: string }>();
    for (const r of rows) {
      for (const item of (r.checklist ?? []) as ChecklistItem[]) {
        if (!map.has(item.id)) map.set(item.id, { id: item.id, label: item.label, category: item.category });
      }
    }
    return Array.from(map.values());
  }, [rows]);

  const [selectedAttributes, setSelectedAttributes] = useState<Set<string>>(new Set());

  // Fishbone categories (top-level hook to avoid nested useMemo)
  const fishboneCategories = useMemo(() => {
    const cats = new Map<string, Map<string, number>>();
    for (const ev of filteredRows) {
      for (const item of (ev.checklist ?? []) as ChecklistItem[]) {
        if (item.answer === 'No') {
          if (!cats.has(item.category)) cats.set(item.category, new Map());
          const causes = cats.get(item.category)!;
          causes.set(item.label, (causes.get(item.label) ?? 0) + 1);
        }
      }
    }
    return Array.from(cats.entries()).map(([name, causes]) => ({
      name,
      causes: Array.from(causes.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 5),
    }));
  }, [filteredRows]);

  // Root Cause Analysis — derives root causes from checklist failures AND keyword matching
  const rootCauseAnalysis = useMemo(() => {
    const causeMap = new Map<string, { count: number; matchedKeywords: Map<string, number> }>();

    // 1. Derive root causes from checklist attribute failures (always available)
    for (const ev of filteredRows) {
      for (const item of (ev.checklist ?? []) as ChecklistItem[]) {
        if (item.answer !== 'No') continue;
        const cat = item.category || 'Non-Critical';
        if (!causeMap.has(cat)) causeMap.set(cat, { count: 0, matchedKeywords: new Map() });
        const cur = causeMap.get(cat)!;
        cur.count++;
        cur.matchedKeywords.set(item.label, (cur.matchedKeywords.get(item.label) ?? 0) + 1);
      }
    }

    // 2. Also match against root_causes table keywords if available
    for (const rc of rootCauses) {
      if (!causeMap.has(rc.name)) causeMap.set(rc.name, { count: 0, matchedKeywords: new Map() });
    }
    for (const ev of filteredRows) {
      const text = `${ev.comment ?? ''} ${ev.feedback_to_agent ?? ''} ${ev.call_summary ?? ''} ${ev.customer_verbatim ?? ''} ${ev.core_issue_l1 ?? ''} ${ev.core_issue_l2 ?? ''} ${ev.core_issue_l3 ?? ''}`.toLowerCase();
      for (const rc of rootCauses) {
        const keywords = rc.keywords ?? [];
        for (const kw of keywords) {
          if (text.includes(kw.toLowerCase())) {
            const cur = causeMap.get(rc.name)!;
            cur.count++;
            cur.matchedKeywords.set(kw, (cur.matchedKeywords.get(kw) ?? 0) + 1);
          }
        }
      }
    }

    // 3. Also use core_issue_l1/l2/l3 as root cause categories
    for (const ev of filteredRows) {
      const issues = [ev.core_issue_l1, ev.core_issue_l2, ev.core_issue_l3].filter(Boolean);
      for (const issue of issues) {
        const cat = String(issue);
        if (!causeMap.has(cat)) causeMap.set(cat, { count: 0, matchedKeywords: new Map() });
        const cur = causeMap.get(cat)!;
        cur.count++;
        cur.matchedKeywords.set('core issue', (cur.matchedKeywords.get('core issue') ?? 0) + 1);
      }
    }

    return Array.from(causeMap.entries())
      .map(([name, v]) => ({
        name, count: v.count,
        topKeywords: Array.from(v.matchedKeywords.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, c]) => ({ word: k, count: c })),
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [filteredRows, rootCauses]);

  const rootCausePieData = useMemo(() => {
    const colors = ['#f59e0b', '#3b82f6', '#10b981', '#dc2626', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];
    return rootCauseAnalysis.map((r, i) => ({ name: r.name, value: r.count, color: colors[i % colors.length] }));
  }, [rootCauseAnalysis]);

  // Comment Analysis based on selected metrics
  const commentAnalysis = useMemo(() => {
    const selectedFields = ANALYSIS_METRICS.filter((m) => selectedMetrics.has(m.key));
    const comments = filteredRows.filter((r) => {
      return selectedFields.some((m) => {
        const val = (r as Record<string, unknown>)[m.field];
        return val && String(val).trim().length > 0;
      });
    });
    const keywordMap = new Map<string, number>();
    for (const r of comments) {
      const text = selectedFields.map((m) => String((r as Record<string, unknown>)[m.field] ?? '')).join(' ').toLowerCase();
      const words = text.split(/\s+/).filter((w) => w.length > 4 && !STOPWORDS.has(w));
      for (const w of words) keywordMap.set(w, (keywordMap.get(w) ?? 0) + 1);
    }
    const topKeywords = Array.from(keywordMap.entries())
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Attribute-based analysis
    const commonErrors = new Map<string, number>();
    const attributeComments = new Map<string, number>();
    for (const ev of filteredRows) {
      for (const item of (ev.checklist ?? []) as ChecklistItem[]) {
        if (item.answer === 'No') {
          commonErrors.set(item.label, (commonErrors.get(item.label) ?? 0) + 1);
        }
        if (item.comment && item.comment.trim().length > 0) {
          attributeComments.set(item.label, (attributeComments.get(item.label) ?? 0) + 1);
        }
      }
    }
    const topErrors = Array.from(commonErrors.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 15);
    const topCommented = Array.from(attributeComments.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 15);

    // Trending problems (combining attribute failures + comments)
    const trendingProblems = new Map<string, number>();
    for (const ev of filteredRows) {
      for (const item of (ev.checklist ?? []) as ChecklistItem[]) {
        if (item.answer === 'No') {
          trendingProblems.set(item.label, (trendingProblems.get(item.label) ?? 0) + 1);
        }
      }
      if (ev.comment) {
        const words = ev.comment.toLowerCase().split(/\s+/).filter((w) => w.length > 5 && !STOPWORDS.has(w));
        for (const w of words) trendingProblems.set(w, (trendingProblems.get(w) ?? 0) + 1);
      }
    }
    const trending = Array.from(trendingProblems.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 15);

    // Pareto data for attribute failures
    const paretoData = topErrors.map((e) => ({ name: e.label.length > 20 ? e.label.slice(0, 20) + '…' : e.label, value: e.count }));

    const holdData = [
      { name: 'Valid Hold', value: comments.filter((r) => r.valid_hold === 'Yes').length, color: '#16a34a' },
      { name: 'Invalid Hold', value: comments.filter((r) => r.valid_hold === 'No').length, color: '#dc2626' },
      { name: 'N/A', value: comments.filter((r) => r.valid_hold === 'N/A' || !r.valid_hold).length, color: '#94a3b8' },
    ];
    const ahtData = [
      { name: 'Valid AHT', value: comments.filter((r) => r.valid_aht === 'Yes').length, color: '#16a34a' },
      { name: 'Long AHT', value: comments.filter((r) => r.valid_aht === 'No').length, color: '#dc2626' },
      { name: 'N/A', value: comments.filter((r) => r.valid_aht === 'N/A' || !r.valid_aht).length, color: '#94a3b8' },
    ];
    const dsatData = [
      { name: 'DSAT', value: comments.filter((r) => r.dsat).length, color: '#dc2626' },
      { name: 'No DSAT', value: comments.filter((r) => !r.dsat).length, color: '#16a34a' },
    ];
    const fcrData = [
      { name: 'Solved', value: comments.filter((r) => r.solved_customer_issue === 'Yes').length, color: '#16a34a' },
      { name: 'Not Solved', value: comments.filter((r) => r.solved_customer_issue === 'No').length, color: '#dc2626' },
      { name: 'N/A', value: comments.filter((r) => !r.solved_customer_issue).length, color: '#94a3b8' },
    ];

    return { comments, topKeywords, holdData, ahtData, dsatData, fcrData, topErrors, topCommented, trending, paretoData };
  }, [filteredRows, selectedMetrics]);

  const filteredKeywords = useMemo(() => {
    if (!keywordSearch) return commentAnalysis.topKeywords;
    return commentAnalysis.topKeywords.filter((k) => k.word.includes(keywordSearch.toLowerCase()));
  }, [commentAnalysis.topKeywords, keywordSearch]);

  const generateCustomChartData = useCallback((config: CustomChartConfig) => {
    const sourceRows = config.dataSource === 'coaching' ? coachingRows as AnalysisRow[] :
                       config.dataSource === 'calibration' ? calibrationRows as AnalysisRow[] :
                       filteredRows;
    const groups = new Map<string, { scores: number[]; count: number; passes: number; errors: { customer: number; business: number; compliance: number; nonCrit: number }; calls: { customer: number; business: number; compliance: number; nonCrit: number } }>();
    for (const r of sourceRows) {
      let key = 'Unknown';
      if (config.groupBy === 'agent') key = (r as AnalysisRow).agent?.agent_name ?? 'Unknown';
      else if (config.groupBy === 'lob') key = (r as AnalysisRow).agent?.lob ?? 'Unknown';
      else if (config.groupBy === 'task_type') key = (r as AnalysisRow).task_type ?? 'Unknown';
      else if (config.groupBy === 'pass_fail') key = (r as AnalysisRow).pass_fail ?? 'Unknown';
      else if (config.groupBy === 'transaction_type') key = (r as AnalysisRow).transaction_type ?? 'Unknown';
      else if (config.groupBy === 'month') key = ((r as AnalysisRow).evaluation_date ?? '').slice(0, 7) || 'Unknown';
      const cur = groups.get(key) ?? { scores: [], count: 0, passes: 0, errors: { customer: 0, business: 0, compliance: 0, nonCrit: 0 }, calls: { customer: 0, business: 0, compliance: 0, nonCrit: 0 } };
      cur.scores.push((r as AnalysisRow).call_score ?? 0);
      cur.count++;
      if ((r as AnalysisRow).pass_fail === 'Pass') cur.passes++;
      const cfg = ((r as AnalysisRow).form_config ?? null) as FormConfig | null;
      const catMap: Record<string, string> = {};
      if (cfg) for (const cat of cfg.categories) catMap[cat.key] = cat.critical ? cat.key : 'NonCritical';
      const answeredCats = new Set<string>();
      for (const item of ((r as AnalysisRow).checklist ?? []) as ChecklistItem[]) {
        if (item.answer === null || item.answer === 'N/A') continue;
        const bucket = catMap[item.category] || 'NonCritical';
        const k = bucket === 'Customer Critical' ? 'customer' : bucket === 'Business Critical' ? 'business' : bucket === 'Compliance Critical' ? 'compliance' : 'nonCrit';
        if (item.answer === 'No') cur.errors[k]++;
        answeredCats.add(k);
      }
      for (const k of answeredCats) cur.calls[k]++;
      groups.set(key, cur);
    }
    const calc = (e: number, c: number) => c > 0 ? Math.round(100 - (e / c) * 100) : 0;
    return Array.from(groups.entries()).map(([key, v]) => {
      let value = 0;
      if (config.metric === 'avg_score') value = v.scores.length > 0 ? Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length) : 0;
      else if (config.metric === 'count') value = v.count;
      else if (config.metric === 'pass_rate') value = v.count > 0 ? Math.round((v.passes / v.count) * 100) : 0;
      else if (config.metric === 'customer_accuracy') value = calc(v.errors.customer, v.calls.customer);
      else if (config.metric === 'business_accuracy') value = calc(v.errors.business, v.calls.business);
      else if (config.metric === 'compliance_accuracy') value = calc(v.errors.compliance, v.calls.compliance);
      else if (config.metric === 'soft_accuracy') value = calc(v.errors.nonCrit, v.calls.nonCrit);
      return { name: key, value };
    }).sort((a, b) => b.value - a.value);
  }, [filteredRows, coachingRows, calibrationRows]);

  const handleAddCustomChart = async (config: CustomChartConfig) => {
    const { data } = await supabase.from('custom_analyses').insert({
      name: config.title, data_source: config.dataSource, chart_type: config.chartType,
      config: { groupBy: config.groupBy, metric: config.metric },
    }).select('*').single();
    if (data) {
      setCustomCharts((prev) => [...prev, { ...config, id: data.id }]);
    } else {
      setCustomCharts((prev) => [...prev, config]);
    }
    setShowAddChart(false);
  };

  const handleDeleteCustomChart = async (id: string) => {
    await supabase.from('custom_analyses').delete().eq('id', id);
    setCustomCharts((prev) => prev.filter((c) => c.id !== id));
  };

  const toggleMetric = (key: string) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAttribute = (id: string) => {
    setSelectedAttributes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) return <LoadingState label="Loading analysis…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const exportData = filteredRows.map((r) => ({
    id: r.id, agent: r.agent?.agent_name ?? '', lob: r.agent?.lob ?? '', project: r.project?.name ?? '',
    evaluation_date: r.evaluation_date, call_score: r.call_score, pass_fail: r.pass_fail,
    task_type: r.task_type, transaction_type: r.transaction_type, dsat: r.dsat,
    coach: r.coach_name, comment: r.comment, customer_verbatim: r.customer_verbatim,
    call_summary: r.call_summary, feedback_to_agent: r.feedback_to_agent,
    valid_hold: r.valid_hold, valid_aht: r.valid_aht, solved_customer_issue: r.solved_customer_issue,
    core_issue_l1: r.core_issue_l1, core_issue_l2: r.core_issue_l2, core_issue_l3: r.core_issue_l3,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={L('page.analysis', 'Analysis')}
        subtitle={`${filteredRows.length} evaluations analyzed`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => downloadCSV('analysis.csv', exportData)} disabled={filteredRows.length === 0} className="btn-secondary">
              <Download className="h-4 w-4" /> CSV
            </button>
            <button onClick={() => downloadExcel('analysis.xls', exportData)} disabled={filteredRows.length === 0} className="btn-secondary">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </button>
            <button onClick={() => downloadJSON('analysis.json', exportData)} disabled={filteredRows.length === 0} className="btn-secondary">
              <FileJson className="h-4 w-4" /> JSON
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
          <label className="label">Date value</label>
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

      {/* Data Source Checklist */}
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Database className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-slate-700">Analyze Data From (checklist)</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {DATA_SOURCES.map((ds) => {
            const Icon = ds.icon;
            const isActive = selectedMetrics.has(ds.key) || (ds.key === 'evaluations' && selectedMetrics.has('qa_comments'));
            return (
              <label key={ds.key} className={cls('flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors',
                isActive ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={() => {
                    if (ds.key === 'evaluations') {
                      toggleMetric('qa_comments');
                    } else {
                      toggleMetric(ds.key);
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <Icon className="h-4 w-4" />
                <span className="text-xs font-medium">{ds.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {([
          { key: 'rootcause', label: 'Root Cause Analysis', icon: GitBranch },
          { key: 'comments', label: 'Comment Keywords', icon: MessageSquare },
          { key: 'custom', label: 'Custom Analysis', icon: BarChart3 },
          { key: 'suggestions', label: 'Suggested Analyses', icon: Sparkles },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={cls('flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              activeTab === t.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState icon={<TrendingUp className="h-10 w-10" />} title="No data to analyze" subtitle="Create evaluations to see analytics" />
      ) : (
        <>
          {/* Root Cause Tab */}
          {activeTab === 'rootcause' && (
            <div className="space-y-4">
              <div className="card p-4">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  <span>Root causes are automatically identified by analyzing evaluation checklist failures, QA comments, coaching feedback, customer verbatim, call summaries, and core issue fields. The analysis groups errors by category and identifies the most frequent causes to help you find the best corrective actions.</span>
                </div>
              </div>

              {/* Analysis Type Selector (checklist) */}
              <div className="card p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">Analysis Type</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ANALYSIS_TYPES.map((at) => {
                    const Icon = at.icon;
                    return (
                      <label key={at.key} className={cls('flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors',
                        selectedAnalysisType === at.key ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                        <input type="radio" name="analysisType" checked={selectedAnalysisType === at.key} onChange={() => setSelectedAnalysisType(at.key)} className="h-4 w-4" />
                        <Icon className="h-4 w-4" />
                        <span className="text-xs font-medium">{at.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Attribute Checklist for filtering */}
              {allChecklistItems.length > 0 && (
                <div className="card p-4">
                  <h3 className="mb-3 text-sm font-semibold text-slate-700">Filter by Attributes (checklist)</h3>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                    {allChecklistItems.map((item) => (
                      <label key={item.id} className={cls('flex cursor-pointer items-center gap-1.5 rounded border p-1.5 text-xs transition-colors',
                        selectedAttributes.has(item.id) ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-100 text-slate-500 hover:bg-slate-50')}>
                        <input type="checkbox" checked={selectedAttributes.has(item.id)} onChange={() => toggleAttribute(item.id)} className="h-3.5 w-3.5 rounded" />
                        <span className="truncate">{item.label}</span>
                      </label>
                    ))}
                  </div>
                  {selectedAttributes.size > 0 && (
                    <button onClick={() => setSelectedAttributes(new Set())} className="mt-2 text-xs text-brand-600 hover:underline">Clear selected</button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard title="Root Cause Distribution" onExportCSV={() => downloadCSV('root_causes.csv', rootCauseAnalysis)} onExportExcel={() => downloadExcel('root_causes.xls', rootCauseAnalysis.map((r) => ({ Root_Cause: r.name, Count: r.count })))} onExportJSON={() => downloadJSON('root_causes.json', rootCauseAnalysis)}>
                  {rootCausePieData.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-sm text-slate-400">No root cause data detected.</p>
                      <p className="mt-1 text-xs text-slate-400">Create evaluations with checklist answers to see root cause analysis.</p>
                    </div>
                  ) : (
                    <LabeledPie data={rootCausePieData} />
                  )}
                </ChartCard>

                <ChartCard title="Root Cause Breakdown" onExportCSV={() => downloadCSV('root_cause_detail.csv', rootCauseAnalysis)}>
                  <div className="space-y-3">
                    {rootCauseAnalysis.length === 0 ? (
                      <div className="py-8 text-center">
                        <p className="text-sm text-slate-400">No root causes detected.</p>
                        <p className="mt-1 text-xs text-slate-400">Root causes are derived from failed checklist attributes, comments, and core issues.</p>
                      </div>
                    ) : (
                      rootCauseAnalysis.map((rc) => (
                        <div key={rc.name} className="rounded-lg border border-slate-100 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-700">{rc.name}</span>
                            <span className="text-sm font-bold tabular-nums text-slate-900">{rc.count}</span>
                          </div>
                          {rc.topKeywords.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {rc.topKeywords.map((k) => (
                                <span key={k.word} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{k.word} ({k.count})</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ChartCard>
              </div>

              {/* Pareto Chart */}
              {commentAnalysis.paretoData.length > 0 && (
                <ChartCard title="Pareto Chart — Most Frequent Mistakes" onExportCSV={() => downloadCSV('pareto_mistakes.csv', commentAnalysis.topErrors)} onExportExcel={() => downloadExcel('pareto_mistakes.xls', commentAnalysis.topErrors)}>
                  <ParetoChart data={commentAnalysis.paretoData} color={FAIL_COLOR} />
                  <p className="mt-2 text-xs text-slate-500">The Pareto principle (80/20 rule) helps identify the vital few attributes causing most failures. Focus on the leftmost bars that account for ~80% of issues.</p>
                </ChartCard>
              )}

              {/* Fishbone Diagram */}
              {fishboneCategories.length > 0 && (
                <ChartCard title="Fishbone (Ishikawa) Diagram — Root Cause by Category" onExportCSV={() => downloadCSV('fishbone.csv', fishboneCategories.flatMap((c) => c.causes.map((ca) => ({ Category: c.name, Cause: ca.label, Count: ca.count }))))}>
                  <FishboneDiagram categories={fishboneCategories} />
                  <p className="mt-2 text-xs text-slate-500">The fishbone diagram shows root causes organized by category. Each branch represents a category of issues, with the most common causes listed.</p>
                </ChartCard>
              )}

              {/* Trending Problems */}
              {commentAnalysis.trending.length > 0 && (
                <ChartCard title="Trending Problems" onExportCSV={() => downloadCSV('trending.csv', commentAnalysis.trending)}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={commentAnalysis.trending} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="label" tick={{ fontSize: 9 }} width={150} />
                      <Tooltip />
                      <Bar dataKey="count" fill={NONCRIT_COLOR} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
          )}

          {/* Comment Keywords Tab */}
          {activeTab === 'comments' && (
            <div className="space-y-4">
              <div className="card p-4">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <MessageSquare className="h-4 w-4 text-brand-600" />
                  <span>Analyzes QA comments, coaching feedback, customer verbatim, call summaries, and agent notes to identify common keywords, trending problems, and root cause signals.</span>
                </div>
              </div>

              {/* Metric Checklist */}
              <div className="card p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">Data Fields to Analyze (checklist)</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ANALYSIS_METRICS.map((m) => (
                    <label key={m.key} className={cls('flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors',
                      selectedMetrics.has(m.key) ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                      <input type="checkbox" checked={selectedMetrics.has(m.key)} onChange={() => toggleMetric(m.key)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                      <span className="text-xs font-medium">{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={keywordSearch} onChange={(e) => setKeywordSearch(e.target.value)} placeholder="Search keywords…" className="input pl-10" />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard title="Comment Keywords (Root Cause Signals)" onExportCSV={() => downloadCSV('comment_keywords.csv', filteredKeywords)} onExportExcel={() => downloadExcel('comment_keywords.xls', filteredKeywords)} onExportJSON={() => downloadJSON('comment_keywords.json', filteredKeywords)}>
                  {filteredKeywords.length === 0 ? (
                    <p className="text-sm text-slate-400">No comment data.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={filteredKeywords} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="word" tick={{ fontSize: 9 }} width={100} />
                        <Tooltip />
                        <Bar dataKey="count" fill={NONCRIT_COLOR} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>

                <div className="space-y-4">
                  <ChartCard title="Hold Analysis" onExportCSV={() => downloadCSV('hold_analysis.csv', commentAnalysis.holdData)}>
                    <LabeledPie data={commentAnalysis.holdData} />
                  </ChartCard>
                  <ChartCard title="AHT Analysis" onExportCSV={() => downloadCSV('aht_analysis.csv', commentAnalysis.ahtData)}>
                    <LabeledPie data={commentAnalysis.ahtData} />
                  </ChartCard>
                </div>

                <ChartCard title="DSAT Analysis" onExportCSV={() => downloadCSV('dsat_analysis.csv', commentAnalysis.dsatData)}>
                  <LabeledPie data={commentAnalysis.dsatData} />
                </ChartCard>

                <ChartCard title="First Call Resolution" onExportCSV={() => downloadCSV('fcr_analysis.csv', commentAnalysis.fcrData)}>
                  <LabeledPie data={commentAnalysis.fcrData} />
                </ChartCard>
              </div>

              {/* Most Commented Attributes */}
              {commentAnalysis.topCommented.length > 0 && (
                <ChartCard title="Most Commented Attributes" onExportCSV={() => downloadCSV('commented_attributes.csv', commentAnalysis.topCommented)}>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={commentAnalysis.topCommented} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="label" tick={{ fontSize: 9 }} width={150} />
                      <Tooltip />
                      <Bar dataKey="count" fill={BUSINESS_COLOR} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
          )}

          {/* Custom Analysis Tab */}
          {activeTab === 'custom' && (
            <div className="space-y-4">
              <div className="card p-4">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Database className="h-4 w-4 text-brand-600" />
                  <span>Create custom charts using data from evaluations, coaching, calibration, agent performance, dashboards, and reports. Charts are saved and can be exported.</span>
                </div>
              </div>

              {customCharts.length > 0 && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {customCharts.map((cc) => {
                    const data = generateCustomChartData(cc);
                    return (
                      <ChartCard
                        key={cc.id}
                        title={cc.title}
                        onExportCSV={() => downloadCSV(`${cc.id}.csv`, data)}
                        onExportExcel={() => downloadExcel(`${cc.id}.xls`, data)}
                        onExportJSON={() => downloadJSON(`${cc.id}.json`, data)}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs text-slate-400 capitalize">{cc.dataSource} · {cc.chartType} · {cc.metric.replace(/_/g, ' ')}</span>
                          <button onClick={() => handleDeleteCustomChart(cc.id)} className="text-xs text-rose-400 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
                        </div>
                        {cc.chartType === 'pareto' ? (
                          <ParetoChart data={data.map((d) => ({ name: d.name, value: d.value }))} />
                        ) : cc.chartType === 'fishbone' ? (
                          <FishboneDiagram categories={data.map((d) => ({ name: d.name, causes: [] }))} />
                        ) : cc.chartType === 'pie' ? (
                          <LabeledPie data={data.map((d, i) => ({ ...d, color: ['#3b82f6', '#10b981', '#f59e0b', '#dc2626', '#8b5cf6', '#06b6d4'][i % 6] }))} />
                        ) : cc.chartType === 'line' ? (
                          <ResponsiveContainer width="100%" height={280}>
                            <LineChart data={data}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 10 }} />
                              <Tooltip />
                              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : cc.chartType === 'table' ? (
                          <table className="w-full text-sm">
                            <thead><tr className="table-header"><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-right">Value</th></tr></thead>
                            <tbody>{data.map((d) => (<tr key={d.name} className="table-row"><td className="px-3 py-2">{d.name}</td><td className="px-3 py-2 text-right font-bold">{d.value}</td></tr>))}</tbody>
                          </table>
                        ) : (
                          <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis type="number" tick={{ fontSize: 10 }} />
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={120} />
                              <Tooltip />
                              <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </ChartCard>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-center">
                <button onClick={() => setShowAddChart(true)} className="btn-secondary">
                  <Plus className="h-4 w-4" /> Add Custom Chart
                </button>
              </div>
            </div>
          )}

          {/* Suggested Analyses Tab */}
          {activeTab === 'suggestions' && (
            <div className="space-y-4">
              <div className="card p-4">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span>Pre-built analysis templates to help you quickly identify issues and root causes. Click any suggestion to run it instantly.</span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {suggestions.map((s) => {
                  const Icon = s.analysis_type === 'pareto' ? BarChart3 : s.analysis_type === 'fishbone' ? Fish : s.analysis_type === 'trend' ? TrendingUp : GitBranch;
                  return (
                    <div key={s.id} className="card p-4 transition-shadow hover:shadow-md">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                          <Icon className="h-4 w-4" />
                        </div>
                        <h3 className="text-sm font-semibold text-slate-800">{s.name}</h3>
                      </div>
                      <p className="mb-3 text-xs text-slate-500">{s.description}</p>
                      <button
                        onClick={() => {
                          handleAddCustomChart({
                            id: `sugg_${Date.now()}`,
                            title: s.name,
                            groupBy: ((s.config as Record<string, string>).groupBy as CustomChartConfig['groupBy']) ?? 'agent',
                            metric: ((s.config as Record<string, string>).metric as CustomChartConfig['metric']) ?? 'count',
                            chartType: s.analysis_type === 'pareto' ? 'pareto' : s.analysis_type === 'fishbone' ? 'fishbone' : s.analysis_type === 'trend' ? 'line' : 'bar',
                            dataSource: 'evaluations',
                          });
                          setActiveTab('custom');
                        }}
                        className="btn-ghost text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" /> Run Analysis
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {showAddChart && (
        <AddCustomChartModal onClose={() => setShowAddChart(false)} onAdd={handleAddCustomChart} />
      )}
    </div>
  );
}

function AddCustomChartModal({ onClose, onAdd }: { onClose: () => void; onAdd: (config: CustomChartConfig) => void }) {
  const [title, setTitle] = useState('');
  const [groupBy, setGroupBy] = useState<CustomChartConfig['groupBy']>('agent');
  const [metric, setMetric] = useState<CustomChartConfig['metric']>('avg_score');
  const [chartType, setChartType] = useState<CustomChartConfig['chartType']>('bar');
  const [dataSource, setDataSource] = useState('evaluations');

  const handleAdd = () => {
    if (!title.trim()) return;
    onAdd({
      id: `chart_${Date.now()}`,
      title: title.trim(),
      groupBy, metric, chartType, dataSource,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Add Custom Chart</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">Chart Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Score by LOB" className="input" />
          </div>
          <div>
            <label className="label">Data Source</label>
            <div className="grid grid-cols-2 gap-1.5">
              {DATA_SOURCES.map((ds) => (
                <label key={ds.key} className={cls('flex cursor-pointer items-center gap-1.5 rounded-lg border p-2 text-xs transition-colors',
                  dataSource === ds.key ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                  <input type="radio" name="dataSource" checked={dataSource === ds.key} onChange={() => setDataSource(ds.key)} className="h-3.5 w-3.5" />
                  <span>{ds.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Chart Type</label>
            <select value={chartType} onChange={(e) => setChartType(e.target.value as CustomChartConfig['chartType'])} className="input">
              <option value="bar">Bar Chart</option>
              <option value="line">Line Chart</option>
              <option value="pie">Pie Chart</option>
              <option value="table">Table</option>
              <option value="pareto">Pareto Chart</option>
              <option value="fishbone">Fishbone Diagram</option>
            </select>
          </div>
          <div>
            <label className="label">Group By</label>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as CustomChartConfig['groupBy'])} className="input">
              <option value="agent">Agent</option>
              <option value="lob">LOB</option>
              <option value="task_type">Task Type</option>
              <option value="transaction_type">Transaction Type</option>
              <option value="pass_fail">Pass/Fail</option>
              <option value="month">Month</option>
            </select>
          </div>
          <div>
            <label className="label">Metric</label>
            <select value={metric} onChange={(e) => setMetric(e.target.value as CustomChartConfig['metric'])} className="input">
              <option value="avg_score">Average Score</option>
              <option value="count">Evaluation Count</option>
              <option value="pass_rate">Pass Rate (%)</option>
              <option value="customer_accuracy">Customer Critical Accuracy</option>
              <option value="business_accuracy">Business Critical Accuracy</option>
              <option value="compliance_accuracy">Compliance Critical Accuracy</option>
              <option value="soft_accuracy">Soft Skills Accuracy</option>
            </select>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleAdd} disabled={!title.trim()} className="btn-primary">
            <Plus className="h-4 w-4" /> Add Chart
          </button>
        </div>
      </div>
    </div>
  );
}

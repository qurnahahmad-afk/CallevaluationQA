import { useEffect, useState, useMemo } from 'react';
import { BookOpen, Search, ChevronDown, ChevronRight, HelpCircle, Lightbulb, Users, Headphones, GraduationCap, ClipboardCheck, UserCog } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { cls } from '../lib/utils';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui';
import type { GlossaryEntry } from '../types';

type GuideSection = {
  id: string;
  role: string;
  section: string;
  title: string;
  content: string;
  sort_order: number;
};

const ROLE_LABELS: Record<string, { label: string; icon: typeof Users }> = {
  operation: { label: 'Operations Team', icon: Users },
  quality: { label: 'Quality Team', icon: Headphones },
  quality_expert: { label: 'Quality Expert', icon: UserCog },
  agent: { label: 'Agents', icon: GraduationCap },
  supervisor: { label: 'Supervisors', icon: ClipboardCheck },
  manager: { label: 'Managers', icon: UserCog },
  admin: { label: 'Administrators', icon: UserCog },
};

const FAQ_ITEMS = [
  { q: 'How is the evaluation score calculated?', a: 'The score is automatically calculated based on the form configuration. Each category (Softskills, Customer Critical, Business Critical, Compliance Critical) contributes to the final score. Critical failures result in a fail regardless of total score.' },
  { q: 'What is the Coaching SLA?', a: 'The Coaching SLA is 24 hours from the evaluation date. If coaching is completed within 24 hours, the SLA is marked as met (Yes). After 24 hours, it is marked as not met (No). The SLA percentage is calculated as: Count(Yes) / (Count(Yes) + Count(No)) x 100.' },
  { q: 'How does calibration work?', a: 'A calibration session is created for a specific transaction. Coaches submit their evaluations, and the Quality Expert submits a reference expert evaluation. The system compares each checklist item and calculates an agreement percentage. A session is calibrated if there are zero critical mismatches and at most 2 non-critical mismatches.' },
  { q: 'Can I see historical calibration sessions for the same transaction?', a: 'Yes. When you create a new calibration session for a transaction, previous sessions remain available. You can review all historical calibration records without overwriting them.' },
  { q: 'What permissions do Quality users have?', a: 'Quality users can only access their own evaluations, coaching sessions, and calibration sessions. They cannot view or modify evaluations created by other Quality team members unless additional permissions are explicitly granted.' },
  { q: 'How do I change my password?', a: 'Click on your profile name in the top right corner, then select "Change Password". Enter your current password and the new password twice. The system verifies your current password before updating.' },
  { q: 'What is the Quality Expert role?', a: 'The Quality Expert has all Quality permissions plus the ability to create and manage calibration sessions, review expert evaluations, compare coach vs. expert evaluations, and finalize calibration results.' },
  { q: 'How do I export reports?', a: 'Navigate to the Reports page, select your project and date range, then click Export to download in CSV or Excel format.' },
  { q: 'What is the System Administration page?', a: 'The System Administration page allows administrators to configure system pages, features, and settings without code changes. Pages can be enabled, disabled, renamed, and new features can be added.' },
];

const BEST_PRACTICES = [
  'Always complete coaching within 24 hours of the evaluation to maintain SLA compliance.',
  'Use specific, actionable feedback in coaching sessions rather than generic comments.',
  'Participate in regular calibration sessions to ensure scoring consistency across the team.',
  'Review the Guide Book periodically to stay updated on system features and processes.',
  'Export reports regularly to track quality trends over time.',
  'Ensure all checklist items are filled in before submitting an evaluation.',
  'Use the Analysis page to identify recurring issues and address them in coaching.',
  'Review historical calibration sessions before creating a new one for the same transaction.',
];

export function GuideBookPage() {
  const { profile } = useAuth();
  const [sections, setSections] = useState<GuideSection[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'guide' | 'faq' | 'practices' | 'glossary'>('guide');

  useEffect(() => {
    (async () => {
      const [guideRes, glossRes] = await Promise.all([
        supabase.from('guide_book_sections').select('*').order('role').order('sort_order'),
        supabase.from('glossary').select('*').order('section').order('attribute'),
      ]);
      if (guideRes.error) setError(guideRes.error.message);
      else setSections((guideRes.data ?? []) as GuideSection[]);
      if (!glossRes.error) setGlossary((glossRes.data ?? []) as GlossaryEntry[]);
      setLoading(false);
    })();
  }, []);

  const userRole = profile?.role ?? 'agent';
  const roleLabel = ROLE_LABELS[userRole]?.label ?? ROLE_LABELS['agent'].label;
  const roleIcon = ROLE_LABELS[userRole]?.icon ?? Users;

  const filteredSections = useMemo(() => {
    if (!search) return sections;
    return sections.filter((s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.content.toLowerCase().includes(search.toLowerCase()) ||
      s.section.toLowerCase().includes(search.toLowerCase())
    );
  }, [sections, search]);

  const sectionsByRole = useMemo(() => {
    const map: Record<string, GuideSection[]> = {};
    for (const s of filteredSections) {
      (map[s.role] ??= []).push(s);
    }
    return map;
  }, [filteredSections]);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) return <LoadingState label="Loading Guide Book…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Guide Book" subtitle="User manual and system guidance" />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the guide book…" className="input pl-10" />
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {([
          { key: 'guide', label: 'Role Guides', icon: BookOpen },
          { key: 'faq', label: 'FAQ', icon: HelpCircle },
          { key: 'practices', label: 'Best Practices', icon: Lightbulb },
          { key: 'glossary', label: 'Glossary', icon: BookOpen },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={cls('flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === t.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'guide' && (
        <div className="space-y-6">
          {sectionsByRole[userRole] && (
            <div className="card overflow-hidden border-brand-200">
              <div className="flex items-center gap-3 bg-brand-50 p-4">
                <roleIcon className="h-5 w-5 text-brand-600" />
                <div>
                  <h3 className="text-sm font-semibold text-brand-900">{roleLabel} — Your Guide</h3>
                  <p className="text-xs text-brand-700">Guidance specific to your role</p>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {sectionsByRole[userRole].map((s) => (
                  <GuideSectionItem key={s.id} section={s} expanded={expandedSections.has(s.id)} onToggle={() => toggleSection(s.id)} />
                ))}
              </div>
            </div>
          )}

          {Object.entries(sectionsByRole)
            .filter(([role]) => role !== userRole)
            .map(([role, roleSections]) => {
              const rl = ROLE_LABELS[role] ?? { label: role, icon: BookOpen };
              return (
                <div key={role} className="card overflow-hidden">
                  <div className="flex items-center gap-3 bg-slate-50 p-4">
                    <rl.icon className="h-5 w-5 text-slate-600" />
                    <h3 className="text-sm font-semibold text-slate-700">{rl.label}</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {roleSections.map((s) => (
                      <GuideSectionItem key={s.id} section={s} expanded={expandedSections.has(s.id)} onToggle={() => toggleSection(s.id)} />
                    ))}
                  </div>
                </div>
              );
            })}

          {Object.keys(sectionsByRole).length === 0 && (
            <EmptyState icon={<BookOpen className="h-10 w-10" />} title="No guide content" subtitle="No content matches your search" />
          )}
        </div>
      )}

      {activeTab === 'faq' && (
        <div className="space-y-3">
          {FAQ_ITEMS.filter((f) => !search || f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase())).map((f, i) => (
            <div key={i} className="card overflow-hidden">
              <button onClick={() => toggleSection(`faq-${i}`)} className="flex w-full items-center gap-3 p-4 text-left">
                {expandedSections.has(`faq-${i}`) ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                <span className="text-sm font-medium text-slate-700">{f.q}</span>
              </button>
              {expandedSections.has(`faq-${i}`) && (
                <div className="border-t border-slate-100 p-4 text-sm leading-relaxed text-slate-600">{f.a}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'practices' && (
        <div className="card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-700">Best Practices</h3>
          </div>
          <ul className="space-y-3">
            {BEST_PRACTICES.filter((b) => !search || b.toLowerCase().includes(search.toLowerCase())).map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeTab === 'glossary' && (
        <div className="space-y-4">
          {glossary.length === 0 ? (
            <EmptyState icon={<BookOpen className="h-10 w-10" />} title="No glossary entries" />
          ) : (
            Object.entries(
              glossary
                .filter((g) => !search || g.attribute.toLowerCase().includes(search.toLowerCase()) || g.description.toLowerCase().includes(search.toLowerCase()))
                .reduce((acc, g) => { (acc[g.section] ??= []).push(g); return acc; }, {} as Record<string, GlossaryEntry[]>)
            ).map(([section, items]) => (
              <div key={section} className="card overflow-hidden">
                <div className="bg-slate-50 p-3 text-sm font-semibold text-slate-700">{section}</div>
                <div className="divide-y divide-slate-100">
                  {items.map((g) => (
                    <div key={g.id} className="flex flex-col gap-1 p-3">
                      <span className="text-sm font-medium text-slate-700">{g.attribute}</span>
                      <span className="text-xs text-slate-500">{g.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function GuideSectionItem({ section, expanded, onToggle }: {
  section: GuideSection;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50">
        {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-700">{section.title}</div>
          <div className="text-xs text-slate-400">{section.section}</div>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-slate-100 p-4 text-sm leading-relaxed text-slate-600">{section.content}</div>
      )}
    </div>
  );
}

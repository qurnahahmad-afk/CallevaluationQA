import { useMemo, useState } from 'react';
import { Search, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { cls } from '../lib/utils';
import { useReferenceData } from '../lib/hooks';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui';
import { useL } from '../lib/labels';
import type { GlossaryEntry } from '../types';

export function GlossaryPage() {
  const L = useL();
  const { glossary, loading, error } = useReferenceData();
  const [search, setSearch] = useState('');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  const sections = useMemo(() => {
    const filtered = search
      ? glossary.filter((g) =>
          g.attribute.toLowerCase().includes(search.toLowerCase()) ||
          g.description.toLowerCase().includes(search.toLowerCase()) ||
          g.section.toLowerCase().includes(search.toLowerCase()))
      : glossary;
    const map = new Map<string, GlossaryEntry[]>();
    for (const entry of filtered) {
      const arr = map.get(entry.section) ?? [];
      arr.push(entry);
      map.set(entry.section, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [glossary, search]);

  const toggleSection = (section: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const expandAll = () => setOpenSections(new Set(sections.map(([s]) => s)));
  const collapseAll = () => setOpenSections(new Set());

  if (loading) return <LoadingState label="Loading glossary…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={L('page.glossary', 'Glossary')}
        subtitle={`${glossary.length} terms across ${sections.length} sections`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={expandAll} className="btn-ghost text-xs">Expand All</button>
            <button onClick={collapseAll} className="btn-ghost text-xs">Collapse All</button>
          </div>
        }
      />

      {/* Search */}
      <div className="card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search glossary terms…"
            className="input pl-9"
          />
        </div>
      </div>

      {/* Sections */}
      {sections.length === 0 ? (
        <EmptyState icon={<BookOpen className="h-10 w-10" />} title="No glossary entries" subtitle="Add reference data in the database to populate the glossary" />
      ) : (
        <div className="space-y-3">
          {sections.map(([section, entries]) => {
            const isOpen = openSections.has(section);
            return (
              <div key={section} className="card overflow-hidden">
                <button
                  onClick={() => toggleSection(section)}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                    <h3 className="text-sm font-semibold text-slate-700">{section}</h3>
                    <span className="badge-neutral">{entries.length}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {entries.map((entry) => (
                      <div key={entry.id} className="p-4">
                        <div className="flex items-start gap-2">
                          <div className={cls('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-brand-50')}>
                            <BookOpen className="h-3 w-3 text-brand-600" />
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-slate-700">{entry.attribute}</div>
                            <div className="mt-1 text-sm text-slate-500">{entry.description}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

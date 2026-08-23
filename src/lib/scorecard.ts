import type { FormConfig, ChecklistItem } from '../types';

export const DEFAULT_FORM_CONFIG: FormConfig = {
  categories: [
    {
      key: 'Softskills',
      label: 'Softskills',
      critical: false,
      items: [
        { id: 'call_opening_closure', label: 'Call Opening / Closure' },
        { id: 'choice_of_words', label: 'Choice of words / Avoid Slang / Technical Terms / Customer name' },
        { id: 'tone_of_voice', label: 'Tone of voice' },
        { id: 'showing_empathy', label: 'Showing Empathy / Handling objection / Interrupting the Customer' },
        { id: 'active_listening', label: 'Active listening / Interrupting' },
        { id: 'hold', label: 'Hold' },
      ],
    },
    {
      key: 'Customer Critical',
      label: 'Customer Critical',
      critical: true,
      items: [
        { id: 'ticket_escalation_status', label: 'Ticket Escalation and Status' },
        { id: 'customer_profile', label: 'Customer Profile / required data' },
        { id: 'transfer_process', label: 'Transfer Process' },
        { id: 'correct_info', label: 'Correct information provided (Knowledge)' },
        { id: 'missing_info', label: 'Missing Information (Knowledge)' },
        { id: 'ticket_description', label: 'Ticket description' },
        { id: 'professionalism', label: 'Professionalism / Attitude' },
      ],
    },
    {
      key: 'Business Critical',
      label: 'Business Critical',
      critical: true,
      items: [
        { id: 'ticket_type_categorization', label: 'Ticket Type and Categorization' },
        { id: 'control_call', label: 'Control the call / Comprehension' },
        { id: 'ticketing_tree', label: 'Ticketing tree' },
      ],
    },
    {
      key: 'Compliance Critical',
      label: 'Compliance Critical',
      critical: true,
      items: [
        { id: 'compliance', label: 'Compliance (Verification, Policy)' },
      ],
    },
  ],
  scoring: {
    basePass: 100,
    baseFail: 30,
    softskillPenalty: 5,
    softskillFailThreshold: 4,
  },
};

export function getFormConfig(project: { form_config?: FormConfig | null } | null | undefined): FormConfig {
  if (project?.form_config && project.form_config.categories?.length > 0) {
    return project.form_config;
  }
  return DEFAULT_FORM_CONFIG;
}

export function getFormConfigForLob(
  project: { form_config?: FormConfig | null; lob_form_config?: Record<string, FormConfig> | null } | null | undefined,
  lob: string | null | undefined
): FormConfig {
  if (lob && project?.lob_form_config) {
    const lobConfig = project.lob_form_config[lob];
    if (lobConfig && lobConfig.categories?.length > 0) return lobConfig;
  }
  return getFormConfig(project);
}

export function createEmptyChecklist(config: FormConfig): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  for (const cat of config.categories) {
    for (const item of cat.items) {
      items.push({ id: item.id, category: cat.key, label: item.label, answer: null, note: '' });
    }
  }
  return items;
}

export type ScoreResult = {
  baseScore: number;
  softskillErrors: number;
  criticalFailures: number;
  callScore: number;
  passFail: 'Pass' | 'Failed';
  answered: number;
  total: number;
  categoryAccuracy: { category: string; key: string; critical: boolean; errors: number; answered: number; accuracy: number }[];
};

export function computeScore(checklist: ChecklistItem[], config?: FormConfig): ScoreResult {
  const cfg = config ?? DEFAULT_FORM_CONFIG;
  const softskillCats = cfg.categories.filter((c) => !c.critical).map((c) => c.key);
  const criticalCats = cfg.categories.filter((c) => c.critical).map((c) => c.key);
  const softskillErrors = checklist.filter((i) => softskillCats.includes(i.category) && i.answer === 'No').length;
  const criticalFailures = checklist.filter((i) => criticalCats.includes(i.category) && i.answer === 'No').length;
  const baseScore = criticalFailures > 0 ? cfg.scoring.baseFail : cfg.scoring.basePass;
  const callScore = Math.max(0, baseScore - cfg.scoring.softskillPenalty * softskillErrors);
  const passFail = criticalFailures > 0 || softskillErrors >= cfg.scoring.softskillFailThreshold ? 'Failed' : 'Pass';
  const answered = checklist.filter((i) => i.answer !== null).length;
  const categoryAccuracy = cfg.categories.map((cat) => {
    const catItems = checklist.filter((i) => i.category === cat.key);
    const catAnswered = catItems.filter((i) => i.answer !== null).length;
    const catErrors = catItems.filter((i) => i.answer === 'No').length;
    return {
      category: cat.label,
      key: cat.key,
      critical: cat.critical,
      errors: catErrors,
      answered: catAnswered,
      accuracy: catAnswered > 0 ? Math.round(((catAnswered - catErrors) / catAnswered) * 100) : 0,
    };
  });
  return { baseScore, softskillErrors, criticalFailures, callScore, passFail, answered, total: checklist.length, categoryAccuracy };
}

export const TASK_TYPES = ['Program', 'User', 'Daily'] as const;
export const TRANSACTION_TYPES = ['Inbound', 'Outbound', 'Email', 'Chat', 'Ticket'] as const;

export type CategoryAccuracyResult = {
  customerCritical: number;
  businessCritical: number;
  complianceCritical: number;
  nonCritical: number;
};

export function computeAccuracyPercentages(checklist: ChecklistItem[], config: FormConfig): CategoryAccuracyResult {
  const totalAnswered = checklist.filter((i) => i.answer !== null && i.answer !== 'N/A').length;
  if (totalAnswered === 0) {
    return { customerCritical: 0, businessCritical: 0, complianceCritical: 0, nonCritical: 0 };
  }
  const catMap: Record<string, string> = {};
  for (const cat of config.categories) {
    catMap[cat.key] = cat.critical ? cat.key : 'NonCritical';
  }
  const counts: Record<string, { errors: number; answered: number }> = {
    'Customer Critical': { errors: 0, answered: 0 },
    'Business Critical': { errors: 0, answered: 0 },
    'Compliance Critical': { errors: 0, answered: 0 },
    'NonCritical': { errors: 0, answered: 0 },
  };
  for (const item of checklist) {
    if (item.answer === null || item.answer === 'N/A') continue;
    const bucket = catMap[item.category] || 'NonCritical';
    if (!counts[bucket]) counts[bucket] = { errors: 0, answered: 0 };
    counts[bucket].answered++;
    if (item.answer === 'No') counts[bucket].errors++;
  }
  const calc = (c: { errors: number; answered: number }) =>
    c.answered > 0 ? Math.round(((c.answered - c.errors) / c.answered) * 100) : 0;
  return {
    customerCritical: calc(counts['Customer Critical']),
    businessCritical: calc(counts['Business Critical']),
    complianceCritical: calc(counts['Compliance Critical']),
    nonCritical: calc(counts['NonCritical']),
  };
}

export type AccuracyDetail = {
  customerCritical: { accuracy: number; errors: number; evaluatedCalls: number };
  businessCritical: { accuracy: number; errors: number; evaluatedCalls: number };
  complianceCritical: { accuracy: number; errors: number; evaluatedCalls: number };
  nonCritical: { accuracy: number; errors: number; evaluatedCalls: number };
};

export function computeAccuracyForEvaluations(
  evaluations: { checklist?: ChecklistItem[] | null; form_config?: FormConfig | null }[]
): AccuracyDetail {
  const totals = {
    customerCritical: { errors: 0, calls: 0 },
    businessCritical: { errors: 0, calls: 0 },
    complianceCritical: { errors: 0, calls: 0 },
    nonCritical: { errors: 0, calls: 0 },
  };
  for (const ev of evaluations) {
    const checklist = ev.checklist ?? [];
    const config = ev.form_config ?? DEFAULT_FORM_CONFIG;
    const catMap: Record<string, string> = {};
    for (const cat of config.categories) {
      catMap[cat.key] = cat.critical ? cat.key : 'NonCritical';
    }
    // Count errors per category — a call is "evaluated" for a metric if it has any answered items in that category
    const hasErrorsInCat: Record<string, boolean> = {};
    for (const item of checklist) {
      if (item.answer === null || item.answer === 'N/A') continue;
      const bucket = catMap[item.category] || 'NonCritical';
      const key = bucket === 'Customer Critical' ? 'customerCritical' : bucket === 'Business Critical' ? 'businessCritical' : bucket === 'Compliance Critical' ? 'complianceCritical' : 'nonCritical';
      if (item.answer === 'No') {
        totals[key].errors++;
        hasErrorsInCat[key] = true;
      }
    }
    // Each evaluation counts as one "evaluated call" per metric that has answered items
    const answeredCats = new Set<string>();
    for (const item of checklist) {
      if (item.answer === null || item.answer === 'N/A') continue;
      const bucket = catMap[item.category] || 'NonCritical';
      const key = bucket === 'Customer Critical' ? 'customerCritical' : bucket === 'Business Critical' ? 'businessCritical' : bucket === 'Compliance Critical' ? 'complianceCritical' : 'nonCritical';
      answeredCats.add(key);
    }
    for (const key of answeredCats) {
      totals[key].calls++;
    }
  }
  const calc = (c: { errors: number; calls: number }) =>
    c.calls > 0 ? Math.round(100 - (c.errors / c.calls) * 100) : 0;
  return {
    customerCritical: { accuracy: calc(totals.customerCritical), errors: totals.customerCritical.errors, evaluatedCalls: totals.customerCritical.calls },
    businessCritical: { accuracy: calc(totals.businessCritical), errors: totals.businessCritical.errors, evaluatedCalls: totals.businessCritical.calls },
    complianceCritical: { accuracy: calc(totals.complianceCritical), errors: totals.complianceCritical.errors, evaluatedCalls: totals.complianceCritical.calls },
    nonCritical: { accuracy: calc(totals.nonCritical), errors: totals.nonCritical.errors, evaluatedCalls: totals.nonCritical.calls },
  };
}

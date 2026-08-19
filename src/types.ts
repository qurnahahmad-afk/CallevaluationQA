export type Role = 'admin' | 'manager' | 'quality' | 'quality_expert' | 'operation' | 'supervisor' | 'agent';

export type ProjectTarget = {
  id: string;
  project_id: string | null;
  metric_key: 'customer_critical' | 'business_critical' | 'compliance_critical' | 'soft_skills';
  target_value: number;
  is_fixed: boolean;
  created_at: string;
  updated_at: string;
};

export type RootCause = {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  sort_order: number;
  created_at: string;
};

export type EvaluationRootCause = {
  id: string;
  evaluation_id: string;
  root_cause_id: string;
  confidence: number;
  matched_keywords: string[];
  created_at: string;
  root_cause?: RootCause | null;
};

export type CustomAnalysis = {
  id: string;
  name: string;
  description: string | null;
  data_source: string;
  chart_type: string;
  config: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
};

export type FormConfig = {
  categories: FormCategory[];
  scoring: ScoringConfig;
};

export type FormCategory = {
  key: string;
  label: string;
  critical: boolean;
  items: FormItem[];
};

export type FormItem = {
  id: string;
  label: string;
};

export type ScoringConfig = {
  basePass: number;
  baseFail: number;
  softskillPenalty: number;
  softskillFailThreshold: number;
};

export type ChecklistAnswer = 'Yes' | 'No' | 'N/A';

export type ChecklistItem = {
  id: string;
  category: string;
  label: string;
  answer: ChecklistAnswer | null;
  note?: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  form_config: FormConfig;
  active: boolean;
  created_at: string;
  lob_config: string[];
  transaction_types: string[];
  lob_form_config: Record<string, FormConfig> | null;
};

export type Agent = {
  id: string;
  agent_name: string;
  attendance_user: string | null;
  mena_me_code: string | null;
  team_leader: string | null;
  qa: string | null;
  lob: string | null;
  active: boolean;
  created_at: string;
  project_id: string | null;
  email: string | null;
  date_of_join: string | null;
  assigned_quality: string | null;
  assigned_operation: string | null;
  assigned_supervisor: string | null;
  role: string | null;
  coach_name: string | null;
  manager_name: string | null;
  project?: Pick<Project, 'id' | 'name'> | null;
};

export type Evaluation = {
  id: string;
  evaluation_date: string;
  agent_id: string | null;
  coach_name: string | null;
  email_date_time: string | null;
  main_skill: string | null;
  mistake_type: string | null;
  transaction_link: string | null;
  caller_number: string | null;
  call_duration: string | null;
  call_score: number;
  pass_fail: string;
  customer_verbatim: string | null;
  comment: string | null;
  call_summary: string | null;
  feedback_to_agent: string | null;
  checklist: ChecklistItem[];
  dsat: boolean;
  dsat_score: string | null;
  dsat_reason_l1: string | null;
  dsat_reason_l2: string | null;
  dsat_reason_l3: string | null;
  sub_type: string | null;
  call_subcategory: string | null;
  repeated_interaction: boolean;
  repeated_reason_l1: string | null;
  repeated_reason_l2: string | null;
  repeated_reason_l3: string | null;
  solved_customer_issue: string | null;
  fcr_not_achieved_l1: string | null;
  fcr_not_achieved_l2: string | null;
  fcr_not_achieved_l3: string | null;
  agent_follow_service_mapping: string | null;
  not_follow_mapping_l1: string | null;
  not_follow_mapping_l2: string | null;
  valid_hold: string | null;
  hold_reason: string | null;
  valid_aht: string | null;
  long_aht_reason: string | null;
  core_issue_l1: string | null;
  core_issue_l2: string | null;
  core_issue_l3: string | null;
  created_at: string;
  project_id: string | null;
  task_type: string | null;
  transaction_type: string | null;
  evaluation_duration_seconds: number | null;
  coach_user_id: string | null;
  form_config: FormConfig | null;
  agent?: Pick<Agent, 'id' | 'agent_name' | 'lob' | 'team_leader' | 'project_id'> | null;
  project?: Pick<Project, 'id' | 'name'> | null;
  coach_profile?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};

export type ReferenceOption = {
  id: string;
  category: string;
  value: string;
  sort_order: number;
};

export type GlossaryEntry = {
  id: string;
  section: string;
  attribute: string;
  description: string;
};

export type ReferenceMap = Record<string, string[]>;

export type CalibrationSession = {
  id: string;
  project_id: string | null;
  transaction_id: string;
  transaction_type: string;
  calibration_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  expert_user_id: string | null;
  expert_user_name: string | null;
  expert_checklist: ChecklistItem[] | null;
  expert_call_score: number | null;
  expert_pass_fail: string | null;
  agreement_percentage: number | null;
  matching_attributes: number | null;
  different_attributes: number | null;
  comparison_details: { item_id: string; label: string; coach_answer: string; expert_answer: string; match: boolean }[] | null;
  final_decision: string | null;
  calibration_status: string | null;
  project?: Pick<Project, 'id' | 'name'> | null;
  evaluations?: CalibrationEvaluation[];
};

export type CalibrationEvaluation = {
  id: string;
  calibration_id: string;
  user_id: string | null;
  user_name: string;
  checklist: ChecklistItem[];
  call_score: number;
  pass_fail: string;
  created_at: string;
};

export type UserProject = {
  id: string;
  user_id: string;
  project_id: string;
  created_at: string;
};

export type PermissionKey =
  | 'view_dashboard' | 'create_evaluation' | 'view_evaluations' | 'manage_agents'
  | 'manage_projects' | 'manage_users' | 'view_reports' | 'view_analysis'
  | 'manage_coaching' | 'manage_calibration' | 'view_glossary' | 'view_agent_performance'
  | 'send_invitations' | 'reset_passwords' | 'view_audit_history' | 'view_coaching_dashboard'
  | 'export_data' | 'view_own_evaluations' | 'view_own_coaching' | 'add_coaching_feedback'
  | 'modify_evaluation' | 'modify_score' | 'data_clearance'
  | 'view_agents_page' | 'create_calibration' | 'manage_calibration_sessions'
  | 'review_expert_evaluations' | 'compare_coach_expert' | 'finalize_calibration'
  | 'manage_system_admin';

export type RolePermissions = {
  role: Role;
  permissions: Record<PermissionKey, boolean>;
  updated_at: string;
};

export type Invitation = {
  id: string;
  email: string;
  role: Role;
  project_id: string | null;
  token: string;
  status: 'pending' | 'accepted' | 'expired';
  invited_by: string | null;
  created_at: string;
  expires_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  related_id: string | null;
  read: boolean;
  created_at: string;
};

export type AuditEntry = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  page_module: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type RepeatedFailureProcess = {
  id: string;
  agent_id: string | null;
  project_id: string | null;
  cycle: number;
  trigger_reason: string;
  trigger_categories: string[];
  trigger_error_count: number;
  trigger_evaluation_ids: string[];
  status: string;
  coach_user_id: string | null;
  operation_user_id: string | null;
  coaching_session_id: string | null;
  assessment_passed: boolean | null;
  assessment_score: number | null;
  quality_feedback_evaluation_id: string | null;
  quality_feedback_requested_at: string | null;
  quality_feedback_completed_at: string | null;
  rf_evaluation_id: string | null;
  coaching_done_at: string | null;
  assessment_id: string | null;
  eval_call_score: number | null;
  eval_pass_fail: string | null;
  eval_checklist: ChecklistItem[] | null;
  eval_remark: string | null;
  manager_user_id: string | null;
  manager_action: string | null;
  manager_feedback: string | null;
  operation_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  agent?: Pick<Agent, 'id' | 'agent_name' | 'lob' | 'team_leader' | 'coach_name' | 'manager_name'> | null;
  project?: Pick<Project, 'id' | 'name'> | null;
  coach_profile?: Pick<Profile, 'id' | 'full_name'> | null;
  operation_profile?: Pick<Profile, 'id' | 'full_name'> | null;
  manager_profile?: Pick<Profile, 'id' | 'full_name'> | null;
};

export type RFAssessmentQuestion = {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'long_answer' | 'rating' | 'checkbox';
  question: string;
  options: string[];
  correct_answer: string | null;
  points: number;
};

export type RFAssessment = {
  id: string;
  rf_process_id: string;
  coach_user_id: string | null;
  title: string;
  questions: RFAssessmentQuestion[];
  agent_submitted_at: string | null;
  agent_answers: Record<string, string | string[]> | null;
  agent_score: number | null;
  agent_passed: boolean | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CustomPageField = {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox' | 'email' | 'tel';
  required: boolean;
  options?: string[];
  default_value?: string;
};

export type CustomPageChart = {
  id: string;
  title: string;
  type: 'bar' | 'line' | 'pie' | 'table' | 'metric';
  data_source: string;
  config: Record<string, unknown>;
};

export type CustomPageButton = {
  id: string;
  label: string;
  action: string;
  variant: 'primary' | 'secondary' | 'ghost';
};

export type CustomPage = {
  id: string;
  title: string;
  description: string | null;
  page_type: string;
  slug: string;
  layout: Record<string, unknown>;
  fields: CustomPageField[];
  filters: Record<string, unknown>[];
  charts: CustomPageChart[];
  tables: Record<string, unknown>[];
  buttons: CustomPageButton[];
  actions: Record<string, unknown>[];
  workflows: WorkflowStep[];
  permissions: Record<string, boolean>;
  status: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RFEscalationAction = {
  name: string;
  type: string;
  role?: string;
};

export type RFEscalationLevel = {
  level: number;
  name: string;
  conditions: {
    customer_critical?: number;
    business_critical?: number;
    compliance_critical?: number;
    non_critical?: number;
    combined_critical?: number;
    any_critical?: number;
    total_failed?: number;
  };
  actions: RFEscalationAction[];
};

export type RFConfig = {
  id: string;
  name: string;
  description: string | null;
  project_id: string | null;
  monitoring_period_months: number;
  customer_critical_threshold: number;
  business_critical_threshold: number;
  compliance_critical_threshold: number;
  non_critical_threshold: number;
  total_failed_evaluations: number;
  combined_critical_threshold: number;
  pass_fail_condition: string;
  rules: RFEscalationLevel[];
  active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DataClearanceLog = {
  id: string;
  admin_user_id: string | null;
  admin_name: string;
  modules: string[];
  date_filter: string;
  record_count: number;
  reason: string;
  created_at: string;
};

export type ConfigEntry = {
  id: string;
  category: string;
  key: string;
  label: string | null;
  description: string | null;
  value: Record<string, unknown>;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type ClearanceType = {
  key: string;
  label: string;
  description: string;
  table?: string;
  dateColumn?: string;
  tables?: { table: string; dateColumn: string }[];
  action_filter?: string;
  icon: string;
  active: boolean;
};

export type WorkflowStep = {
  step: number;
  name: string;
  role: string;
  processing_hours?: number;
  description?: string;
};

export type AnalysisSuggestion = {
  id: string;
  name: string;
  description: string;
  analysis_type: string;
  config: Record<string, unknown>;
  created_at: string;
};

export type CoachingSession = {
  id: string;
  evaluation_id: string | null;
  agent_id: string | null;
  project_id: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  conducted_date: string | null;
  duration_minutes: number | null;
  status: string;
  conducted_by: string | null;
  confirmed_by: string | null;
  notes: string | null;
  created_at: string;
  coach_name: string | null;
  feedback_to_agent: string | null;
  sla_met: boolean | null;
  sla_hours: number | null;
  strength_points: string | null;
  improvement_points: string | null;
  action_points: string | null;
  agent_confirmation: string | null;
  agent_notes: string | null;
  conducted_at: string | null;
  agent?: Pick<Agent, 'id' | 'agent_name' | 'lob' | 'team_leader' | 'coach_name' | 'manager_name'> | null;
  evaluation?: Pick<Evaluation, 'id' | 'call_score' | 'pass_fail' | 'evaluation_date' | 'transaction_link' | 'task_type' | 'transaction_type' | 'main_skill'> | null;
  project?: Pick<Project, 'id' | 'name'> | null;
};

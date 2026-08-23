import { supabase } from './supabase';
import { useAuth } from './auth';
import type { Profile } from '../types';

export type AuditAction = string;
export type EntityType = string;

type AuditInput = {
  action: AuditAction;
  entity_type: EntityType;
  entity_id?: string | null;
  page_module?: string;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  details?: Record<string, unknown>;
};

let cachedProfile: Profile | null = null;

export function setAuditProfile(p: Profile | null) {
  cachedProfile = p;
}

export async function logAudit(input: AuditInput): Promise<void> {
  try {
    const profile = cachedProfile;
    await supabase.from('audit_history').insert({
      user_id: profile?.id ?? null,
      user_email: profile?.email ?? null,
      user_role: profile?.role ?? null,
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      page_module: input.page_module ?? null,
      old_value: input.old_value ?? null,
      new_value: input.new_value ?? null,
      ip_address: null,
      details: input.details ?? {},
    });
  } catch {
    // Audit logging should never break the main operation
  }
}

export function useAudit() {
  const { profile } = useAuth();
  setAuditProfile(profile);
  return { logAudit };
}

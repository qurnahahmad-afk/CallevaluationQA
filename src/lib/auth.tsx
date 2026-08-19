import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { setAuditProfile } from './audit';
import type { Profile, Project, Role, PermissionKey } from '../types';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  projects: Project[];
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  permissions: Record<PermissionKey, boolean>;
  hasPermission: (key: PermissionKey) => boolean;
};

const DEFAULT_PERMISSIONS: Record<PermissionKey, boolean> = {
  view_dashboard: false, create_evaluation: false, view_evaluations: false,
  manage_agents: false, manage_projects: false, manage_users: false,
  view_reports: false, view_analysis: false, manage_coaching: false,
  manage_calibration: false, view_glossary: false, view_agent_performance: false,
  send_invitations: false, reset_passwords: false, view_audit_history: false,
  view_coaching_dashboard: false, export_data: false,
  view_own_evaluations: false, view_own_coaching: false, add_coaching_feedback: false,
  modify_evaluation: false, modify_score: false, data_clearance: false,
  view_agents_page: false, create_calibration: false, manage_calibration_sessions: false,
  review_expert_evaluations: false, compare_coach_expert: false, finalize_calibration: false,
  manage_system_admin: false,
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean>>(DEFAULT_PERMISSIONS);

  useEffect(() => { setAuditProfile(profile); }, [profile]);

  const loadProfile = async (uid: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error || !data) { setProfile(null); return null; }
    setProfile(data as Profile);
    return data as Profile;
  };

  const loadPermissions = async (role: Role) => {
    const { data, error } = await supabase.from('role_permissions').select('permissions').eq('role', role).maybeSingle();
    if (error || !data) {
      setPermissions(DEFAULT_PERMISSIONS);
      return;
    }
    const perms = { ...DEFAULT_PERMISSIONS, ...(data.permissions as Record<PermissionKey, boolean>) };
    setPermissions(perms);
  };

  const loadProjects = async (role: Role, uid: string) => {
    const { data, error } = await supabase.from('projects').select('*').eq('active', true).order('name');
    if (error || !data) { setProjects([]); return; }
    const allProjects = data as Project[];
    if (role !== 'admin') {
      const { data: userProjects } = await supabase.from('user_projects').select('project_id').eq('user_id', uid);
      if (userProjects && userProjects.length > 0) {
        const allowedIds = new Set(userProjects.map((up: { project_id: string }) => up.project_id));
        setProjects(allProjects.filter((p) => allowedIds.has(p.id)));
      } else { setProjects(allProjects); }
    } else { setProjects(allProjects); }
  };

  useEffect(() => {
    let active = true;

    // Safety net: never let loading stay true forever
    const safetyTimer = setTimeout(() => { if (active) setLoading(false); }, 8000);

    (async () => {
      try {
        const { data: { session: existing } } = await supabase.auth.getSession();
        if (!active) return;
        if (existing?.user) {
          setSession(existing);
          const prof = await loadProfile(existing.user.id);
          if (!active) return;
          if (prof) {
            await loadProjects(prof.role, existing.user.id);
            await loadPermissions(prof.role);
          }
        }
      } catch {
        // If anything goes wrong (stale/corrupted session, network error), clear it
        try { await supabase.auth.signOut(); } catch { /* ignore */ }
        setSession(null);
        setProfile(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event: string, newSession: Session | null) => {
      setSession(newSession);
      if (newSession?.user) {
        (async () => {
          try {
            const prof = await loadProfile(newSession.user.id);
            if (prof) {
              await loadProjects(prof.role, newSession.user.id);
              await loadPermissions(prof.role);
            }
          } catch { /* ignore — profile stays null, user sees login */ }
        })();
      } else {
        setProfile(null);
        setProjects([]);
        setPermissions(DEFAULT_PERMISSIONS);
      }
    });

    // 15-minute inactivity timeout
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    const INACTIVITY_MS = 15 * 60 * 1000;
    const resetTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        supabase.auth.signOut();
        window.location.hash = '#/';
        window.location.reload();
      }, INACTIVITY_MS);
    };
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      active = false;
      clearTimeout(safetyTimer);
      listener.subscription.unsubscribe();
      if (inactivityTimer) clearTimeout(inactivityTimer);
      activityEvents.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, []);

  const refreshProfile = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setProjects([]);
    setPermissions(DEFAULT_PERMISSIONS);
  };

  const hasPermission = (key: PermissionKey) => permissions[key] ?? false;

  return (
    <AuthContext.Provider value={{ session, profile, loading, projects, activeProjectId, setActiveProjectId, refreshProfile, signIn, signOut, permissions, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

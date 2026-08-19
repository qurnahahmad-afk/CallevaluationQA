import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Agent, GlossaryEntry, ReferenceMap, ReferenceOption, Profile, Project, UserProject, ProjectTarget, RootCause } from '../types';

export function useProjectTargets(projectId?: string | null) {
  const [targets, setTargets] = useState<ProjectTarget[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from('project_targets').select('*');
      if (!active) return;
      setTargets((data ?? []) as ProjectTarget[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);
  const getTarget = (metric: ProjectTarget['metric_key'], pid?: string | null): number => {
    const projId = pid ?? projectId;
    const found = targets.find((t) => t.project_id === projId && t.metric_key === metric);
    if (found) return found.target_value;
    const global = targets.find((t) => t.project_id === null && t.metric_key === metric);
    return global?.target_value ?? 95;
  };
  return { targets, loading, getTarget, setTargets };
}

export function useRootCauses() {
  const [rootCauses, setRootCauses] = useState<RootCause[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from('root_causes').select('*').order('sort_order');
      if (!active) return;
      setRootCauses((data ?? []) as RootCause[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);
  return { rootCauses, loading, setRootCauses };
}

export function useAgents(projectId?: string | null) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      let query = supabase.from('agents').select('*, project:projects(id, name)').order('active', { ascending: false }).order('agent_name', { ascending: true });
      if (projectId) query = query.eq('project_id', projectId);
      const { data, error } = await query;
      if (!active) return;
      if (error) setError(error.message); else setAgents(data ?? []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [projectId]);
  return { agents, loading, error, setAgents };
}

export function useReferenceData() {
  const [refs, setRefs] = useState<ReferenceMap>({});
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const [refRes, glossRes] = await Promise.all([
        supabase.from('reference_options').select('*').order('category').order('sort_order'),
        supabase.from('glossary').select('*').order('section').order('attribute'),
      ]);
      if (!active) return;
      if (refRes.error || glossRes.error) { setError(refRes.error?.message ?? glossRes.error?.message ?? 'Unknown error'); }
      else {
        const map: ReferenceMap = {};
        for (const r of (refRes.data ?? []) as ReferenceOption[]) { (map[r.category] ??= []).push(r.value); }
        setRefs(map); setGlossary(glossRes.data ?? []);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);
  return { refs, glossary, loading, error };
}

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (!active) return;
      if (error) setError(error.message); else setProfiles(data ?? []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);
  return { profiles, loading, error, setProfiles };
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.from('projects').select('*').order('name');
      if (!active) return;
      if (error) setError(error.message); else setProjects(data ?? []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);
  return { projects, loading, error, setProjects };
}

export function useUserProjects() {
  const [userProjects, setUserProjects] = useState<UserProject[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from('user_projects').select('*');
      if (!active) return;
      setUserProjects(data ?? []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);
  return { userProjects, loading, setUserProjects };
}

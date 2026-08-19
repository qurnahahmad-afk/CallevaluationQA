import { useEffect, useState } from 'react';

export type Route =
  | { name: 'dashboard' }
  | { name: 'new' }
  | { name: 'evaluations' }
  | { name: 'evaluation'; id: string }
  | { name: 'agents' }
  | { name: 'glossary' }
  | { name: 'guide-book' }
  | { name: 'coaching' }
  | { name: 'calibration' }
  | { name: 'reports' }
  | { name: 'analysis' }
  | { name: 'users' }
  | { name: 'projects' }
  | { name: 'agent-performance' }
  | { name: 'coaching-dashboard' }
  | { name: 'agent-portal' }
  | { name: 'audit' }
  | { name: 'branding' }
  | { name: 'system-admin' }
  | { name: 'repeated-failure' }
  | { name: 'data-clearance' };

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'dashboard' };
  if (parts[0] === 'new') return { name: 'new' };
  if (parts[0] === 'evaluations') {
    if (parts[1]) return { name: 'evaluation', id: decodeURIComponent(parts[1]) };
    return { name: 'evaluations' };
  }
  if (parts[0] === 'agents') return { name: 'agents' };
  if (parts[0] === 'glossary' || parts[0] === 'guide-book') return { name: 'guide-book' };
  if (parts[0] === 'coaching') return { name: 'coaching' };
  if (parts[0] === 'calibration') return { name: 'calibration' };
  if (parts[0] === 'reports') return { name: 'reports' };
  if (parts[0] === 'analysis') return { name: 'analysis' };
  if (parts[0] === 'users') return { name: 'users' };
  if (parts[0] === 'projects') return { name: 'projects' };
  if (parts[0] === 'agent-performance') return { name: 'agent-performance' };
  if (parts[0] === 'coaching-dashboard') return { name: 'coaching-dashboard' };
  if (parts[0] === 'agent-portal') return { name: 'agent-portal' };
  if (parts[0] === 'audit') return { name: 'audit' };
  if (parts[0] === 'branding') return { name: 'branding' };
  if (parts[0] === 'system-admin') return { name: 'system-admin' };
  if (parts[0] === 'repeated-failure') return { name: 'repeated-failure' };
  if (parts[0] === 'data-clearance') return { name: 'data-clearance' };
  return { name: 'dashboard' };
}

export function navigate(route: Route) {
  const path =
    route.name === 'dashboard' ? '#/' : route.name === 'new' ? '#/new'
    : route.name === 'evaluations' ? '#/evaluations'
    : route.name === 'evaluation' ? `#/evaluations/${encodeURIComponent(route.id)}`
    : route.name === 'agents' ? '#/agents'
    : route.name === 'guide-book' ? '#/guide-book'
    : route.name === 'glossary' ? '#/guide-book'
    : route.name === 'coaching' ? '#/coaching' : route.name === 'calibration' ? '#/calibration'
    : route.name === 'reports' ? '#/reports' : route.name === 'analysis' ? '#/analysis'
    : route.name === 'users' ? '#/users' : route.name === 'projects' ? '#/projects'
    : route.name === 'agent-performance' ? '#/agent-performance'
    : route.name === 'coaching-dashboard' ? '#/coaching-dashboard'
    : route.name === 'agent-portal' ? '#/agent-portal'
    : route.name === 'audit' ? '#/audit'
    : route.name === 'branding' ? '#/branding'
    : route.name === 'system-admin' ? '#/system-admin'
    : route.name === 'repeated-failure' ? '#/repeated-failure'
    : route.name === 'data-clearance' ? '#/data-clearance'
    : '#/';
  window.location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash());
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

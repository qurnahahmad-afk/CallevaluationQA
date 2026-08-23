import { AuthProvider, useAuth } from './lib/auth';
import { LabelsProvider } from './lib/labels';
import { Shell } from './components/Shell';
import { useRoute } from './lib/router';
import { Dashboard } from './pages/Dashboard';
import { NewEvaluation } from './pages/NewEvaluation';
import { EvaluationsList } from './pages/EvaluationsList';
import { EvaluationDetail } from './pages/EvaluationDetail';
import { AgentsPage } from './pages/AgentsPage';
import { GlossaryPage } from './pages/GlossaryPage';
import { GuideBookPage } from './pages/GuideBookPage';
import { CoachingPage } from './pages/CoachingPage';
import { CalibrationPage } from './pages/CalibrationPage';
import { ReportsPage } from './pages/ReportsPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { UsersPage } from './pages/UsersPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { AgentPerformancePage } from './pages/AgentPerformancePage';
import { CoachingDashboardPage } from './pages/CoachingDashboardPage';
import { AgentPortalPage } from './pages/AgentPortalPage';
import { AuditHistoryPage } from './pages/AuditHistoryPage';
import { BrandingPage } from './pages/BrandingPage';
import { LoginPage } from './pages/LoginPage';
import { SystemAdminPage } from './pages/SystemAdminPage';
import { RepeatedFailurePage } from './pages/RepeatedFailurePage';
import { DataClearancePage } from './pages/DataClearancePage';
import { LoadingState } from './components/ui';

function AppContent() {
  const { session, profile, loading } = useAuth();
  const route = useRoute();
  if (loading) return <LoadingState label="Loading…" />;
  if (!session || !profile) return <LoginPage />;
  return (
    <Shell>
      {route.name === 'dashboard' && <Dashboard />}
      {route.name === 'new' && <NewEvaluation />}
      {route.name === 'evaluations' && <EvaluationsList />}
      {route.name === 'evaluation' && <EvaluationDetail id={route.id} />}
      {route.name === 'agents' && <AgentsPage />}
      {route.name === 'guide-book' && <GuideBookPage />}
      {route.name === 'glossary' && <GuideBookPage />}
      {route.name === 'coaching' && <CoachingPage />}
      {route.name === 'calibration' && <CalibrationPage />}
      {route.name === 'reports' && <ReportsPage />}
      {route.name === 'analysis' && <AnalysisPage />}
      {route.name === 'repeated-failure' && <RepeatedFailurePage />}
      {route.name === 'users' && <UsersPage />}
      {route.name === 'projects' && <ProjectsPage />}
      {route.name === 'agent-performance' && <AgentPerformancePage />}
      {route.name === 'coaching-dashboard' && <CoachingDashboardPage />}
      {route.name === 'agent-portal' && <AgentPortalPage />}
      {route.name === 'audit' && <AuditHistoryPage />}
      {route.name === 'branding' && <BrandingPage />}
      {route.name === 'system-admin' && <SystemAdminPage />}
      {route.name === 'data-clearance' && <DataClearancePage />}
    </Shell>
  );
}

export default function App() {
  return <AuthProvider><LabelsProvider><AppContent /></LabelsProvider></AuthProvider>;
}

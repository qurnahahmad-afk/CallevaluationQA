import type { ReactNode } from 'react';
import { cls } from '../lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <div className={cls('animate-spin rounded-full border-2 border-slate-200 border-t-brand-600', className)} style={{ width: '1em', height: '1em' }} />;
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center gap-3 text-slate-400">
      <Spinner className="h-6 w-6" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-50 text-danger-600">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      </div>
      <p className="text-sm font-medium text-slate-700">Something went wrong</p>
      <p className="mt-1 text-sm text-slate-500">{message}</p>
      {onRetry && <button onClick={onRetry} className="btn-secondary mt-5">Try again</button>}
    </div>
  );
}

export function EmptyState({ icon, title, subtitle, action }: { icon?: ReactNode; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      <h3 className="text-base font-semibold text-slate-600">{title}</h3>
      {subtitle && <p className="mt-1 max-w-sm text-sm text-slate-400">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: { title: string; subtitle?: string; actions?: ReactNode; breadcrumb?: ReactNode }) {
  return (
    <div className="mb-6">
      {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function ScoreBadge({ score, passFail }: { score: number; passFail: string }) {
  const isPass = passFail === 'Pass';
  return (
    <div className="flex items-center gap-2">
      <span className={cls('text-sm font-bold tabular-nums', score >= 90 ? 'text-success-600' : score >= 75 ? 'text-warning-600' : 'text-danger-600')}>{score}</span>
      <span className={isPass ? 'badge-pass' : 'badge-fail'}>{isPass ? 'Pass' : 'Failed'}</span>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (['pass', 'passed', 'completed', 'confirmed', 'conducted', 'active'].includes(s)) return <span className="badge-pass">{status}</span>;
  if (['fail', 'failed', 'rejected', 'expired', 'inactive'].includes(s)) return <span className="badge-fail">{status}</span>;
  if (['pending', 'in progress', 'scheduled'].includes(s)) return <span className="badge-warning">{status}</span>;
  return <span className="badge-neutral">{status}</span>;
}

export function Card({ title, icon, actions, children, className }: { title?: string; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cls('card p-5', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between">
          {title && (
            <h3 className="section-title">
              {icon && <span className="text-brand-600">{icon}</span>}
              {title}
            </h3>
          )}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function Toast({ message, type = 'success', onClose }: { message: string; type?: 'success' | 'error' | 'info'; onClose?: () => void }) {
  const tones = {
    success: 'bg-success-50 border-success-200 text-success-800',
    error: 'bg-danger-50 border-danger-200 text-danger-800',
    info: 'bg-accent-50 border-accent-200 text-accent-800',
  };
  return (
    <div className={cls('fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-cardHover animate-slideIn', tones[type])}>
      <span className="text-sm font-medium">{message}</span>
      {onClose && <button onClick={onClose} className="text-current opacity-60 hover:opacity-100">&times;</button>}
    </div>
  );
}

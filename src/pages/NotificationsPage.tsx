import { useEffect, useState, useCallback } from 'react';
import { Bell, CheckCheck, AlertCircle, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { navigate } from '../lib/router';
import { fmtDateTime } from '../lib/utils';
import { PageHeader, EmptyState, LoadingState } from '../components/ui';
import type { Notification } from '../types';

const TYPE_TO_ROUTE: Record<string, string> = {
  coaching: 'coaching',
  evaluation: 'evaluations',
  calibration: 'calibration',
  'repeated-failure': 'repeated-failure',
  exams: 'exams',
};

export function NotificationsPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('notifications').select('*').eq('user_id', profile?.id ?? '').order('created_at', { ascending: false }).limit(100);
    setItems((data ?? []) as Notification[]);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingState />;

  const markRead = async (n: Notification) => {
    if (!n.read) { await supabase.from('notifications').update({ read: true }).eq('id', n.id); void load(); }
  };
  const markAll = async () => {
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile?.id ?? '').eq('read', false);
    void load();
  };
  const openNotification = async (n: Notification) => {
    await markRead(n);
    const route = TYPE_TO_ROUTE[n.type] ?? TYPE_TO_ROUTE[n.type?.toLowerCase() ?? ''];
    if (route) navigate({ name: route as never });
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Notifications"
        subtitle="System alerts and action items"
        actions={<button onClick={markAll} className="btn-secondary"><CheckCheck className="h-4 w-4" /> Mark all read</button>}
      />
      <div className="space-y-2">
        {items.length === 0 && <EmptyState icon={<Bell className="h-12 w-12" />} title="No notifications" subtitle="You're all caught up" />}
        {items.map((n) => (
          <div
            key={n.id}
            className={`card cursor-pointer p-4 transition-shadow hover:shadow-md ${n.read ? 'border-slate-200' : 'border-brand-300 bg-brand-50/30'}`}
            onClick={() => void openNotification(n)}
          >
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${n.type === 'urgent' ? 'bg-danger-50 text-danger-600' : 'bg-brand-50 text-brand-600'}`}>
                {n.type === 'urgent' ? <AlertCircle className="h-4 w-4 animate-pulse" /> : <Bell className="h-4 w-4" />}
              </div>
              <div className="flex-1">
                <div className="font-medium text-slate-800">{n.title}</div>
                {n.message && <div className="text-sm text-slate-600">{n.message}</div>}
                <div className="mt-1 text-xs text-slate-400">{fmtDateTime(n.created_at)}</div>
              </div>
              <ChevronRight className="mt-2 h-4 w-4 text-slate-300" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

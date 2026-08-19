export function cls(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 1) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtCallDuration(value: string | null | undefined): string {
  if (!value) return '—';
  const parts = value.split(':').map(Number);
  if (parts.some((part) => Number.isNaN(part)) || parts.length < 2 || parts.length > 3) return value;
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => {
      const v = r[h];
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    }).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadExcel(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join('\t')];
  for (const row of rows) {
    lines.push(headers.map((h) => String(row[h] ?? '').replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t'));
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type TargetTone = 'green' | 'yellow' | 'red';

export function getTargetTone(actual: number, target: number): TargetTone {
  if (actual >= target) return 'green';
  if (actual >= target - 3) return 'yellow';
  return 'red';
}

export function toneColor(tone: TargetTone): string {
  if (tone === 'green') return '#16a34a';
  if (tone === 'yellow') return '#f59e0b';
  return '#dc2626';
}

export function toneBg(tone: TargetTone): string {
  if (tone === 'green') return 'bg-success-50 text-success-700';
  if (tone === 'yellow') return 'bg-warning-50 text-warning-700';
  return 'bg-danger-50 text-danger-700';
}

export function toneBar(tone: TargetTone): string {
  if (tone === 'green') return 'bg-success-500';
  if (tone === 'yellow') return 'bg-warning-500';
  return 'bg-danger-500';
}

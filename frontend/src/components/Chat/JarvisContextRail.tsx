import { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarDays, ListChecks } from 'lucide-react';
import { useNavigate } from 'react-router';
import { fetchWorkspaceOverview, type WorkspaceOverview } from '../../lib/workspace-api';
import type { AssistantPageContext } from '../../lib/page-context';

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Context rail for the expanded dock: what the user is looking at plus a
 * read-only snapshot of the business workspace. It reads the same workspace
 * API the pages use, once per open — no polling, no second data source — and
 * shows nothing when the read fails rather than falling back to invented
 * numbers.
 */
export function JarvisContextRail({ context }: { context: AssistantPageContext }) {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    fetchWorkspaceOverview()
      .then((data) => {
        if (cancelled) return;
        setOverview(data);
        setStatus('ready');
      })
      .catch(() => {
        // The rail is supplementary; a failed read leaves the cards out.
        if (!cancelled) setStatus('failed');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = overview
    ? [
        { label: 'Open tasks', value: overview.tasks.open },
        { label: 'Due today', value: overview.tasks.due_today },
        { label: 'Overdue', value: overview.tasks.overdue },
      ]
    : [];

  return (
    <aside
      aria-label="Context"
      className="hidden md:flex w-[260px] shrink-0 flex-col gap-3 p-3 overflow-y-auto"
      style={{ borderLeft: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}
    >
      <section
        className="rounded-xl p-3"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-tertiary)' }}>
          Viewing
        </div>
        <div className="text-sm font-medium mt-1" style={{ color: 'var(--color-text)' }}>
          {context.label}
        </div>
        <div className="text-[11px] font-mono mt-0.5 truncate" style={{ color: 'var(--color-text-tertiary)' }}>
          {context.path}
        </div>
      </section>

      <section
        className="rounded-xl p-3"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-tertiary)' }}>
          Business workspace
        </div>
        <div className="text-sm font-medium mt-1" style={{ color: 'var(--color-text)' }}>
          J&amp;M Visuals
        </div>
        {rows.length > 0 ? (
          <dl className="mt-2 space-y-1">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between text-xs">
                <dt style={{ color: 'var(--color-text-secondary)' }}>{row.label}</dt>
                <dd className="font-medium tabular-nums" style={{ color: 'var(--color-text)' }}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
            {status === 'loading' ? 'Loading workspace…' : 'Workspace snapshot unavailable.'}
          </p>
        )}
      </section>

      {overview && overview.events.length > 0 && (
        <section
          className="rounded-xl p-3"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-tertiary)' }}>
            <CalendarDays size={11} /> Upcoming
          </div>
          <ul className="mt-2 space-y-1.5">
            {overview.events.slice(0, 3).map((event) => (
              <li key={event.id} className="text-xs" style={{ color: 'var(--color-text)' }}>
                {event.title}
                <span className="block text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {formatWhen(event.starts_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-auto flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => navigate('/workspace/tasks')}
          className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md cursor-pointer"
          style={{ color: 'var(--color-text-secondary)', background: 'transparent', border: '1px solid var(--color-border)' }}
        >
          <ListChecks size={12} /> Open tasks
        </button>
        <button
          type="button"
          onClick={() => navigate('/workspace/assistant')}
          className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md cursor-pointer"
          style={{ color: 'var(--color-text-secondary)', background: 'transparent', border: '1px solid var(--color-border)' }}
        >
          <ArrowUpRight size={12} /> Workspace actions
        </button>
      </div>
    </aside>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Circle, Clock, Plus, RefreshCw } from 'lucide-react';
import {
  createEvent,
  createTask,
  fetchWorkspaceOverview,
  updateTask,
  type WorkspaceOverview,
} from '../lib/workspace-api';
import {
  EmptyState,
  Panel,
  PriorityBadge,
  TextButton,
  formatDate,
  formatDateTime,
} from '../components/Workspace/ui';

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
        {label}
      </div>
      <div className="text-xl font-semibold mt-1" style={{ color: tone ?? 'var(--color-text)' }}>
        {value}
      </div>
    </div>
  );
}

export function WorkspacePage() {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [quickTask, setQuickTask] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setOverview(await fetchWorkspaceOverview('business'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the workspace');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addTask = async () => {
    if (!quickTask.trim()) return;
    setSaving(true);
    try {
      // A quick-add on the Today screen belongs on today's list, so give it
      // an end-of-day deadline unless the user later edits it.
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 0, 0);
      await createTask({
        title: quickTask.trim(),
        workspace: 'business',
        due_at: endOfToday.toISOString(),
      });
      setQuickTask('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the task');
    } finally {
      setSaving(false);
    }
  };

  const addEvent = async () => {
    if (!eventTitle.trim() || !eventStart) return;
    setSaving(true);
    try {
      await createEvent({
        title: eventTitle.trim(),
        starts_at: new Date(eventStart).toISOString(),
        workspace: 'business',
      });
      setEventTitle('');
      setEventStart('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the event');
    } finally {
      setSaving(false);
    }
  };

  const complete = async (id: string) => {
    try {
      await updateTask(id, { status: 'done' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete the task');
    }
  };

  if (loading) {
    return <EmptyState>Loading today’s workspace…</EmptyState>;
  }

  if (!overview) {
    return (
      <Panel title="Workspace unavailable">
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {error || 'The workspace API did not respond.'}
        </p>
        <button
          onClick={load}
          className="mt-3 flex items-center gap-1.5 text-sm underline cursor-pointer"
          style={{ color: 'var(--color-accent)' }}
        >
          <RefreshCw size={13} /> Retry
        </button>
      </Panel>
    );
  }

  const erroredIntegrations = (overview.integrations ?? []).filter((i) => i.status === 'error');

  return (
    <div className="space-y-4">
      {error && (
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }}
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Open tasks" value={overview.tasks.open} />
        <Stat
          label="Due today"
          value={overview.tasks.due_today}
          tone={overview.tasks.due_today > 0 ? 'var(--color-accent-amber)' : undefined}
        />
        <Stat
          label="Overdue"
          value={overview.tasks.overdue}
          tone={overview.tasks.overdue > 0 ? 'var(--color-error)' : undefined}
        />
        <Stat label="Memories" value={overview.memory.total} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Today">
          {overview.tasks.overdue_list.length > 0 && (
            <div className="mb-3">
              <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--color-error)' }}>
                Overdue
              </div>
              {overview.tasks.overdue_list.map((task) => (
                <div key={task.id} className="flex items-center gap-2 py-1.5">
                  <button
                    onClick={() => complete(task.id)}
                    aria-label={`Complete ${task.title}`}
                    className="cursor-pointer shrink-0"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    <Circle size={16} />
                  </button>
                  <span className="text-sm truncate flex-1" style={{ color: 'var(--color-text)' }}>
                    {task.title}
                  </span>
                  <PriorityBadge priority={task.priority} />
                  <span className="text-xs shrink-0" style={{ color: 'var(--color-error)' }}>
                    <Clock size={11} className="inline mr-1" />
                    {formatDate(task.due_at)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {overview.tasks.today.length === 0 && overview.tasks.overdue_list.length === 0 ? (
            <EmptyState>Nothing due today. Add work below or in Tasks.</EmptyState>
          ) : (
            overview.tasks.today.map((task) => (
              <div key={task.id} className="flex items-center gap-2 py-1.5">
                <button
                  onClick={() => complete(task.id)}
                  aria-label={`Complete ${task.title}`}
                  className="cursor-pointer shrink-0"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <Circle size={16} />
                </button>
                <span className="text-sm truncate flex-1" style={{ color: 'var(--color-text)' }}>
                  {task.title}
                </span>
                <PriorityBadge priority={task.priority} />
              </div>
            ))
          )}

          <div className="flex gap-2 mt-4">
            <input
              value={quickTask}
              onChange={(e) => setQuickTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addTask();
              }}
              placeholder="Add a task for today…"
              className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
            />
            <TextButton onClick={addTask} disabled={saving || !quickTask.trim()}>
              <span className="flex items-center gap-1">
                <Plus size={13} /> Add
              </span>
            </TextButton>
          </div>
        </Panel>

        <Panel title="Upcoming events">
          {overview.events.length === 0 ? (
            <EmptyState>No events in the next two weeks.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {overview.events.map((event) => (
                <li key={event.id} className="flex items-start gap-2">
                  <CalendarDays size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--color-accent)' }} />
                  <div className="min-w-0">
                    <div className="text-sm truncate" style={{ color: 'var(--color-text)' }}>
                      {event.title}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {formatDateTime(event.starts_at)}
                      {event.location ? ` · ${event.location}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 space-y-2">
            <input
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="Event title"
              className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
            />
            <div className="flex gap-2">
              <input
                type="datetime-local"
                value={eventStart}
                onChange={(e) => setEventStart(e.target.value)}
                aria-label="Event start"
                className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none"
                style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
              />
              <TextButton onClick={addEvent} disabled={saving || !eventTitle.trim() || !eventStart}>
                Add event
              </TextButton>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Updates">
          {overview.updates.length === 0 ? (
            <EmptyState>Changes you make will appear here.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {overview.updates.map((update) => (
                <li key={update.id} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--color-text-tertiary)' }} />
                  <span className="flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                    {update.message}
                  </span>
                  <span className="text-xs shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                    {formatDate(update.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Project load">
          {overview.projects.length === 0 ? (
            <EmptyState>Tag tasks with a project to see the load.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {overview.projects.map((project) => (
                <li key={project.name} className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--color-text-secondary)' }}>{project.name}</span>
                  <span style={{ color: 'var(--color-text)' }}>{project.open_tasks} open</span>
                </li>
              ))}
            </ul>
          )}
          {erroredIntegrations.length > 0 && (
            <p className="text-xs mt-3" style={{ color: 'var(--color-error)' }}>
              {erroredIntegrations.length} integration
              {erroredIntegrations.length === 1 ? '' : 's'} need attention — see Integrations.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Filter, Plus, Trash2 } from 'lucide-react';
import {
  createTask,
  deleteTask,
  fetchTasks,
  updateTask,
  type Priority,
  type TaskStatus,
  type WorkspaceScope,
  type WorkspaceTask,
} from '../lib/workspace-api';
import {
  ConfirmDialog,
  EmptyState,
  Panel,
  PriorityBadge,
  TextButton,
  formatDate,
} from '../components/Workspace/ui';

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];

export function WorkspaceTasksPage() {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('open');
  const [scopeFilter, setScopeFilter] = useState<'all' | WorkspaceScope>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<WorkspaceTask | null>(null);

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueAt, setDueAt] = useState('');
  const [project, setProject] = useState('');
  const [scope, setScope] = useState<WorkspaceScope>('business');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const params: { status?: TaskStatus; workspace?: WorkspaceScope } = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (scopeFilter !== 'all') params.workspace = scopeFilter;
      setTasks(await fetchTasks(params));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tasks');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, scopeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createTask({
        title: title.trim(),
        priority,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        project: project.trim(),
        workspace: scope,
      });
      setTitle('');
      setDueAt('');
      setProject('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the task');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (task: WorkspaceTask) => {
    try {
      await updateTask(task.id, { status: task.status === 'open' ? 'done' : 'open' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the task');
    }
  };

  const changePriority = async (task: WorkspaceTask, next: Priority) => {
    try {
      await updateTask(task.id, { priority: next });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the task');
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteTask(pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the task');
    }
  };

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

      <Panel title="New task">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
            placeholder="What needs doing?"
            aria-label="Task title"
            className="md:col-span-5 px-3 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            aria-label="Priority"
            className="md:col-span-2 px-2 py-1.5 rounded-lg text-sm outline-none cursor-pointer"
            style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            aria-label="Due date"
            className="md:col-span-2 px-2 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
          />
          <input
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="Project"
            aria-label="Project"
            className="md:col-span-2 px-3 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
          />
          <div className="md:col-span-1">
            <TextButton onClick={add} disabled={saving || !title.trim()}>
              <span className="flex items-center gap-1">
                <Plus size={13} /> Add
              </span>
            </TextButton>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Workspace
          </span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as WorkspaceScope)}
            aria-label="Workspace"
            className="px-2 py-1 rounded text-xs outline-none cursor-pointer"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          >
            <option value="business">Business</option>
            <option value="personal">Personal</option>
            <option value="project">Project</option>
          </select>
        </div>
      </Panel>

      <Panel
        title={`Tasks${loading ? '' : ` (${tasks.length})`}`}
        action={
          <div className="flex items-center gap-1.5">
            <Filter size={13} style={{ color: 'var(--color-text-tertiary)' }} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | TaskStatus)}
              aria-label="Filter by status"
              className="px-2 py-1 rounded text-xs outline-none cursor-pointer"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            >
              <option value="open">Open</option>
              <option value="done">Completed</option>
              <option value="all">All</option>
            </select>
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as 'all' | WorkspaceScope)}
              aria-label="Filter by workspace"
              className="px-2 py-1 rounded text-xs outline-none cursor-pointer"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            >
              <option value="all">All workspaces</option>
              <option value="business">Business</option>
              <option value="personal">Personal</option>
              <option value="project">Project</option>
            </select>
          </div>
        }
      >
        {tasks.length === 0 && !loading ? (
          <EmptyState>No tasks match this filter.</EmptyState>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border-subtle)' }}>
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center gap-2 py-2">
                <button
                  onClick={() => toggle(task)}
                  aria-label={task.status === 'open' ? `Complete ${task.title}` : `Reopen ${task.title}`}
                  className="shrink-0 cursor-pointer"
                  style={{ color: task.status === 'done' ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}
                >
                  {task.status === 'done' ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm truncate"
                    style={{
                      color: task.status === 'done' ? 'var(--color-text-tertiary)' : 'var(--color-text)',
                      textDecoration: task.status === 'done' ? 'line-through' : 'none',
                    }}
                  >
                    {task.title}
                  </div>
                  <div className="text-[11px] flex items-center gap-2" style={{ color: 'var(--color-text-tertiary)' }}>
                    {task.project && <span>{task.project}</span>}
                    {task.due_at && <span>Due {formatDate(task.due_at)}</span>}
                    <span className="capitalize">{task.workspace}</span>
                  </div>
                </div>
                <select
                  value={task.priority}
                  onChange={(e) => changePriority(task, e.target.value as Priority)}
                  aria-label={`Priority for ${task.title}`}
                  className="px-1.5 py-0.5 rounded text-[11px] outline-none cursor-pointer shrink-0"
                  style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <PriorityBadge priority={task.priority} />
                <button
                  onClick={() => setPendingDelete(task)}
                  aria-label={`Delete ${task.title}`}
                  className="p-1 rounded cursor-pointer shrink-0"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this task?"
        body={
          pendingDelete
            ? `“${pendingDelete.title}” will be removed permanently. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete task"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

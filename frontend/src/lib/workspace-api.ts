import { apiFetch } from './api';

// ---------------------------------------------------------------------------
// Workspace API — tasks, categorised memory, events, integrations and the
// assistant routing layer. Every call goes through apiFetch so the Bearer
// token is attached when the server requires one.
// ---------------------------------------------------------------------------

export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'open' | 'done';
export type WorkspaceScope = 'personal' | 'business' | 'project';
export type MemoryCategory = 'personal' | 'business' | 'project' | 'preference';

export interface WorkspaceTask {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  status: TaskStatus;
  due_at: string | null;
  project: string;
  workspace: WorkspaceScope;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;
  source: string;
  project: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceEvent {
  id: string;
  title: string;
  starts_at: string;
  location: string;
  workspace: WorkspaceScope;
  created_at: string;
}

export type IntegrationStatus = 'connected' | 'not_connected' | 'syncing' | 'error';

export interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  credential: string;
  requires_credentials: boolean;
  status: IntegrationStatus;
  last_sync: string | null;
  errors: Array<string | null>;
  connectors: Array<{
    connector_id: string;
    connected: boolean;
    state: string;
    error?: string | null;
  }>;
}

export interface WorkspaceProfile {
  id: string;
  name: string;
  kind: string;
  tagline: string;
  services: string[];
  projects: string[];
}

export interface ActivityEntry {
  id: string;
  kind: string;
  message: string;
  created_at: string;
}

export interface WorkspaceOverview {
  tasks: {
    open: number;
    completed: number;
    due_today: number;
    overdue: number;
    today: WorkspaceTask[];
    overdue_list: WorkspaceTask[];
    priority_breakdown: Record<Priority, number>;
  };
  projects: Array<{ name: string; open_tasks: number }>;
  memory: {
    categories: Array<{ category: MemoryCategory; count: number }>;
    total: number;
  };
  events: WorkspaceEvent[];
  updates: ActivityEntry[];
  profile?: WorkspaceProfile | null;
  integrations?: Integration[];
}

export interface RouteDecision {
  intent: string;
  label: string;
  confidence: number;
  handler: string;
  requires_approval: boolean;
  approval_reason: string;
  rationale: string;
  matched: string[];
  entities: Record<string, unknown>;
}

export interface ExecuteResult {
  status: 'done' | 'pending_approval' | 'needs_input' | 'routed';
  decision: RouteDecision;
  message?: string;
  task?: WorkspaceTask;
  tasks?: WorkspaceTask[];
  memory?: MemoryEntry;
  memories?: MemoryEntry[];
  event?: WorkspaceEvent;
  candidate_approvals?: unknown;
  candidates?: WorkspaceTask[];
  integrations?: Integration[];
  approval?: { id: string; description: string; tier: string; permission_key: string };
  delivery_status?: 'not_configured';
  chat_path?: string;
  business?: { profile: WorkspaceProfile; overview: WorkspaceOverview };
}

async function parse<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const message = detail && typeof detail.detail === 'string' ? detail.detail : fallback;
    throw new Error(`${message} (HTTP ${res.status})`);
  }
  return res.json();
}

// --- overview --------------------------------------------------------------

export async function fetchWorkspaceOverview(workspace?: WorkspaceScope): Promise<WorkspaceOverview> {
  const query = workspace ? `?workspace=${workspace}` : '';
  const res = await apiFetch(`/v1/workspace/overview${query}`);
  return parse(res, 'Failed to load workspace overview');
}

// --- tasks -----------------------------------------------------------------

export async function fetchTasks(params: {
  status?: TaskStatus;
  workspace?: WorkspaceScope;
  project?: string;
} = {}): Promise<WorkspaceTask[]> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.workspace) search.set('workspace', params.workspace);
  if (params.project) search.set('project', params.project);
  const query = search.toString() ? `?${search.toString()}` : '';
  const res = await apiFetch(`/v1/workspace/tasks${query}`);
  const data = await parse<{ tasks: WorkspaceTask[] }>(res, 'Failed to load tasks');
  return data.tasks;
}

export async function createTask(input: {
  title: string;
  notes?: string;
  priority?: Priority;
  due_at?: string | null;
  project?: string;
  workspace?: WorkspaceScope;
}): Promise<WorkspaceTask> {
  const res = await apiFetch('/v1/workspace/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await parse<{ task: WorkspaceTask }>(res, 'Failed to create task');
  return data.task;
}

export async function updateTask(
  id: string,
  updates: Partial<Pick<WorkspaceTask, 'title' | 'notes' | 'priority' | 'status' | 'due_at' | 'project' | 'workspace'>>,
): Promise<WorkspaceTask> {
  const res = await apiFetch(`/v1/workspace/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const data = await parse<{ task: WorkspaceTask }>(res, 'Failed to update task');
  return data.task;
}

export async function deleteTask(id: string): Promise<void> {
  const res = await apiFetch(`/v1/workspace/tasks/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete task (HTTP ${res.status})`);
}

// --- memory ----------------------------------------------------------------

export async function fetchMemory(category?: MemoryCategory): Promise<MemoryEntry[]> {
  const query = category ? `?category=${category}` : '';
  const res = await apiFetch(`/v1/workspace/memory${query}`);
  const data = await parse<{ entries: MemoryEntry[] }>(res, 'Failed to load memory');
  return data.entries;
}

export async function createMemory(input: {
  category: MemoryCategory;
  content: string;
  project?: string;
}): Promise<MemoryEntry> {
  const res = await apiFetch('/v1/workspace/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await parse<{ entry: MemoryEntry }>(res, 'Failed to save memory');
  return data.entry;
}

export async function deleteMemory(id: string): Promise<void> {
  const res = await apiFetch(`/v1/workspace/memory/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete memory (HTTP ${res.status})`);
}

// --- events ----------------------------------------------------------------

export async function fetchEvents(upcoming = false): Promise<WorkspaceEvent[]> {
  const query = upcoming ? '?upcoming=true' : '';
  const res = await apiFetch(`/v1/workspace/events${query}`);
  const data = await parse<{ events: WorkspaceEvent[] }>(res, 'Failed to load events');
  return data.events;
}

export async function createEvent(input: {
  title: string;
  starts_at: string;
  location?: string;
  workspace?: WorkspaceScope;
}): Promise<WorkspaceEvent> {
  const res = await apiFetch('/v1/workspace/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await parse<{ event: WorkspaceEvent }>(res, 'Failed to create event');
  return data.event;
}

// --- integrations ----------------------------------------------------------

export async function fetchIntegrations(): Promise<Integration[]> {
  const res = await apiFetch('/v1/workspace/integrations');
  const data = await parse<{ integrations: Integration[] }>(res, 'Failed to load integrations');
  return data.integrations;
}

// --- assistant routing -----------------------------------------------------

export async function routeMessage(
  message: string,
  workspace?: WorkspaceScope,
): Promise<RouteDecision> {
  const res = await apiFetch('/v1/workspace/assistant/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, workspace }),
  });
  const data = await parse<{ decision: RouteDecision }>(res, 'Failed to route message');
  return data.decision;
}

export async function executeMessage(input: {
  message: string;
  workspace?: WorkspaceScope;
  task_id?: string;
  starts_at?: string;
  location?: string;
}): Promise<ExecuteResult> {
  const res = await apiFetch('/v1/workspace/assistant/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parse<ExecuteResult>(res, 'Failed to run assistant action');
}

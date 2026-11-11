// Context the global Jarvis dock hands to the assistant so a short follow-up
// ("what about this one?") is read against the screen the user is looking at.
//
// The context is a transient system message for one request: it is never
// persisted into the conversation and it only restates what the signed-in user
// already has on screen. Authorization is unchanged — every workspace and chat
// read still goes through the authenticated API.

export type PageArea =
  | 'chat'
  | 'dashboard'
  | 'workspace'
  | 'agents'
  | 'data'
  | 'settings'
  | 'other';

export interface PageDescriptor {
  path: string;
  label: string;
  area: PageArea;
}

export interface AssistantPageContext extends PageDescriptor {
  project?: string;
  client?: string;
  task?: string;
}

interface RouteEntry {
  path: string;
  label: string;
  area: PageArea;
}

// Longest-prefix wins, so nested workspace routes are matched before
// '/workspace' itself.
const ROUTES: RouteEntry[] = [
  { path: '/', label: 'Chat', area: 'chat' },
  { path: '/dashboard', label: 'Dashboard', area: 'dashboard' },
  { path: '/settings', label: 'Settings', area: 'settings' },
  { path: '/get-started', label: 'Get started', area: 'settings' },
  { path: '/data-sources', label: 'Data sources', area: 'data' },
  { path: '/agents', label: 'Agents', area: 'agents' },
  { path: '/logs', label: 'Logs', area: 'agents' },
  { path: '/workspace', label: 'Workspace · Today', area: 'workspace' },
  { path: '/workspace/tasks', label: 'Workspace · Tasks', area: 'workspace' },
  { path: '/workspace/memory', label: 'Workspace · Memory', area: 'workspace' },
  { path: '/workspace/assistant', label: 'Workspace · Assistant', area: 'workspace' },
  { path: '/workspace/integrations', label: 'Workspace · Integrations', area: 'workspace' },
];

const WORKSPACE_BLURB = 'J&M Visuals — photo & video production studio';

/** Human label and area for a route, used in the dock header and prompt. */
export function describePage(pathname: string): PageDescriptor {
  const path = pathname.replace(/\/+$/, '') || '/';
  const exact = ROUTES.find((route) => route.path === path);
  if (exact) return { path, label: exact.label, area: exact.area };

  const prefix = ROUTES.filter(
    (route) => route.path !== '/' && path.startsWith(`${route.path}/`),
  ).sort((a, b) => b.path.length - a.path.length)[0];
  if (prefix) return { path, label: prefix.label, area: prefix.area };

  return { path, label: path, area: 'other' };
}

function cleanParam(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

/**
 * Context for the current view. Only selections that are already expressed in
 * the URL are included — the app has no selected-task or selected-client state
 * yet, and inventing one here would make Jarvis answer about a record the user
 * never picked.
 */
export function contextForLocation(pathname: string, search: string): AssistantPageContext {
  const page = describePage(pathname);
  const params = new URLSearchParams(search);
  return {
    ...page,
    project: cleanParam(params.get('project')),
    client: cleanParam(params.get('client')),
    task: cleanParam(params.get('task')),
  };
}

/** The system message for one request, or null when there is nothing to add. */
export function buildAssistantContext(context: AssistantPageContext): string | null {
  const lines = [
    'Current OpenJarvis view for the signed-in user:',
    `- Page: ${context.label} (${context.path})`,
    `- Business workspace: ${WORKSPACE_BLURB}`,
  ];
  if (context.project) lines.push(`- Project in context: ${context.project}`);
  if (context.client) lines.push(`- Client in context: ${context.client}`);
  if (context.task) lines.push(`- Task in context: ${context.task}`);
  lines.push(
    'Use the view only to interpret what the user means right now. Do not summarise the page unless asked, and never invent workspace data you were not given.',
  );
  return lines.join('\n');
}

export interface AssistantTurn {
  role: string;
  content: string;
}

/** Prepends the page context to an outgoing request without touching history. */
export function withPageContext<T extends AssistantTurn>(
  messages: T[],
  context: string | null | undefined,
): AssistantTurn[] {
  if (!context) return messages;
  return [{ role: 'system', content: context }, ...messages];
}

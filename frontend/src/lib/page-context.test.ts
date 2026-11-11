import { describe, expect, it } from 'vitest';

import {
  buildAssistantContext,
  contextForLocation,
  describePage,
  withPageContext,
} from './page-context';

describe('describePage', () => {
  it('labels known routes', () => {
    expect(describePage('/').label).toBe('Chat');
    expect(describePage('/settings').label).toBe('Settings');
    expect(describePage('/workspace/tasks').area).toBe('workspace');
  });

  it('prefers the deepest workspace route', () => {
    expect(describePage('/workspace').label).toBe('Workspace · Today');
    expect(describePage('/workspace/memory').label).toBe('Workspace · Memory');
    expect(describePage('/workspace/memory/').label).toBe('Workspace · Memory');
  });

  it('falls back to the path for unknown routes', () => {
    const page = describePage('/somewhere/new');
    expect(page.area).toBe('other');
    expect(page.label).toBe('/somewhere/new');
  });
});

describe('buildAssistantContext', () => {
  it('names the page the user is viewing', () => {
    const context = buildAssistantContext(contextForLocation('/workspace/tasks', ''));
    expect(context).toContain('Workspace · Tasks');
    expect(context).toContain('/workspace/tasks');
    expect(context).toContain('J&M Visuals');
    // The model is told not to narrate the page.
    expect(context).toContain('Do not summarise the page unless asked');
  });

  it('only includes selections present in the URL', () => {
    const without = contextForLocation('/workspace/tasks', '');
    expect(without.project).toBeUndefined();
    expect(buildAssistantContext(without)).not.toContain('Project in context');

    const withProject = contextForLocation('/workspace/tasks', '?project=Autumn%20wedding');
    expect(withProject.project).toBe('Autumn wedding');
    expect(buildAssistantContext(withProject)).toContain('Project in context: Autumn wedding');
  });

  it('drops blank and overlong selection values', () => {
    expect(contextForLocation('/workspace/tasks', '?client=%20%20').client).toBeUndefined();
    expect(contextForLocation('/workspace/tasks', `?task=${'x'.repeat(300)}`).task).toHaveLength(120);
  });
});

describe('withPageContext', () => {
  const history = [
    { role: 'user', content: 'How is the studio doing?' },
    { role: 'assistant', content: 'Good.' },
  ];

  it('leaves history untouched without context', () => {
    expect(withPageContext(history, null)).toBe(history);
  });

  it('prepends one system message and does not mutate the history', () => {
    const out = withPageContext(history, 'Current OpenJarvis view');
    expect(out[0]).toEqual({ role: 'system', content: 'Current OpenJarvis view' });
    expect(out).toHaveLength(history.length + 1);
    expect(history).toHaveLength(2);
  });
});

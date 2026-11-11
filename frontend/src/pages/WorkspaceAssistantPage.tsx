import { useState } from 'react';
import { ArrowRight, CheckCircle2, Clock, ShieldAlert, Sparkles } from 'lucide-react';
import { executeMessage, type ExecuteResult } from '../lib/workspace-api';
import { EmptyState, Panel, TextButton, formatDateTime } from '../components/Workspace/ui';

const EXAMPLES = [
  'Add a task to cull the wedding photos by Friday',
  'Remember that I prefer natural light for portraits',
  'Sync my gmail before the briefing',
  'Send an email to the client about the invoice',
  'How is J&M Visuals doing this month?',
];

export function WorkspaceAssistantPage() {
  const [message, setMessage] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!message.trim()) return;
    setRunning(true);
    setError('');
    try {
      const outcome = await executeMessage({
        message: message.trim(),
        workspace: 'business',
        starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
      });
      setResult(outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run the request');
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Ask the assistant">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run();
          }}
          rows={3}
          placeholder="Tell the assistant what you need — it routes the request and asks before anything leaves the device."
          aria-label="Assistant request"
          className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
          style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
        />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <label className="text-xs flex items-center gap-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
            Start time (scheduling only)
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="px-2 py-1 rounded text-xs outline-none"
              style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
            />
          </label>
          <div className="ml-auto">
            <TextButton onClick={run} disabled={running || !message.trim()}>
              <span className="flex items-center gap-1">
                <Sparkles size={13} /> {running ? 'Working…' : 'Run'}
              </span>
            </TextButton>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => setMessage(example)}
              className="px-2 py-1 rounded text-[11px] cursor-pointer"
              style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
            >
              {example}
            </button>
          ))}
        </div>
      </Panel>

      {error && (
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }}
        >
          {error}
        </div>
      )}

      {result && (
        <Panel title="Result">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span
              className="px-2 py-0.5 rounded text-[11px] font-medium"
              style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}
            >
              {result.decision.label}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {Math.round(result.decision.confidence * 100)}% confidence
            </span>
            {result.decision.requires_approval && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]"
                style={{ background: 'var(--color-accent-amber-subtle)', color: 'var(--color-accent-amber)' }}
              >
                <ShieldAlert size={11} /> Approval required
              </span>
            )}
          </div>

          {result.status === 'pending_approval' && (
            <div
              className="rounded-lg p-3 text-sm"
              style={{ background: 'var(--color-accent-amber-subtle)', color: 'var(--color-text)' }}
            >
              <div className="flex items-start gap-2">
                <ShieldAlert size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--color-accent-amber)' }} />
                <div>
                  <p>{result.message}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    {result.decision.approval_reason} Approve or deny it from the approval bell in the top bar.
                  </p>
                  {result.delivery_status === 'not_configured' && (
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                      No messaging integration is connected yet, so approval records consent but does
                      not deliver a message.
                    </p>
                  )}
                  {result.approval && (
                    <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                      {result.approval.id}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {result.status === 'done' && (
            <div className="space-y-2">
              {result.task && (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
                  <CheckCircle2 size={15} style={{ color: 'var(--color-success)' }} />
                  Task created: {result.task.title}
                </div>
              )}
              {result.memory && (
                <div className="flex items-start gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
                  <CheckCircle2 size={15} className="mt-0.5" style={{ color: 'var(--color-success)' }} />
                  Saved to {result.memory.category} memory: {result.memory.content}
                </div>
              )}
              {result.event && (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
                  <Clock size={15} style={{ color: 'var(--color-accent)' }} />
                  Event scheduled: {result.event.title} · {formatDateTime(result.event.starts_at)}
                </div>
              )}
              {result.message && (
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {result.message}
                </p>
              )}
              {result.tasks && result.tasks.length > 0 && (
                <ul className="text-sm space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
                  {result.tasks.slice(0, 8).map((task) => (
                    <li key={task.id} className="flex items-center gap-2">
                      <ArrowRight size={12} style={{ color: 'var(--color-text-tertiary)' }} />
                      {task.title}
                    </li>
                  ))}
                </ul>
              )}
              {result.integrations && result.integrations.length > 0 && (
                <ul className="text-sm space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
                  {result.integrations.map((integration) => (
                    <li key={integration.id}>
                      {integration.name} — {integration.status.replace('_', ' ')}
                    </li>
                  ))}
                </ul>
              )}
              {result.business && (
                <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {result.business.profile.name}: {result.business.overview.tasks.open} open tasks,{' '}
                  {result.business.overview.tasks.due_today} due today,{' '}
                  {result.business.overview.memory.total} stored memories.
                </div>
              )}
            </div>
          )}

          {result.status === 'needs_input' && (
            <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {result.message}
              {result.candidates && result.candidates.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {result.candidates.map((task) => (
                    <li key={task.id}>· {task.title}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result.status === 'routed' && (
            <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {result.message}
            </div>
          )}

          {result.decision.matched.length > 0 && (
            <p className="text-[11px] mt-3" style={{ color: 'var(--color-text-tertiary)' }}>
              Routing cues: {result.decision.matched.join(', ')}
            </p>
          )}
        </Panel>
      )}

      {!result && !error && (
        <EmptyState>
          The assistant routes each request before acting. Deletes, syncs and outgoing messages are
          queued for approval instead of firing immediately.
        </EmptyState>
      )}
    </div>
  );
}

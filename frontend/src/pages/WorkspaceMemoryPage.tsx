import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  createMemory,
  deleteMemory,
  fetchMemory,
  type MemoryCategory,
  type MemoryEntry,
} from '../lib/workspace-api';
import {
  ConfirmDialog,
  EmptyState,
  MEMORY_LABELS,
  Panel,
  TextButton,
  formatDate,
} from '../components/Workspace/ui';

const CATEGORIES: MemoryCategory[] = ['personal', 'business', 'project', 'preference'];

const CATEGORY_HINT: Record<MemoryCategory, string> = {
  personal: 'Facts about you that are not client work.',
  business: 'How J&M Visuals runs — clients, pricing, process.',
  project: 'Details tied to a specific shoot or deliverable.',
  preference: 'How you like things done.',
};

export function WorkspaceMemoryPage() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [active, setActive] = useState<MemoryCategory>('business');
  const [draft, setDraft] = useState('');
  const [project, setProject] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MemoryEntry | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setEntries(await fetchMemory());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load memory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const result: Record<MemoryCategory, number> = {
      personal: 0,
      business: 0,
      project: 0,
      preference: 0,
    };
    for (const entry of entries) result[entry.category] += 1;
    return result;
  }, [entries]);

  const visible = entries.filter((entry) => entry.category === active);

  const save = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await createMemory({
        category: active,
        content: draft.trim(),
        project: active === 'project' ? project.trim() : '',
      });
      setDraft('');
      setProject('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the memory');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteMemory(pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not forget this memory');
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {CATEGORIES.map((category) => {
          const isActive = category === active;
          return (
            <button
              key={category}
              onClick={() => setActive(category)}
              aria-pressed={isActive}
              className="rounded-xl p-3 text-left cursor-pointer transition-colors"
              style={{
                background: isActive ? 'var(--color-accent-subtle)' : 'var(--color-surface)',
                border: `1px solid ${isActive ? 'var(--color-accent-glow)' : 'var(--color-border)'}`,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  {MEMORY_LABELS[category]}
                </span>
                <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {counts[category]}
                </span>
              </div>
              <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                {CATEGORY_HINT[category]}
              </p>
            </button>
          );
        })}
      </div>

      <Panel title={`${MEMORY_LABELS[active]} memory`}>
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={CATEGORY_HINT[active]}
            aria-label={`New ${MEMORY_LABELS[active]} memory`}
            rows={2}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
            style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
          />
          {active === 'project' && (
            <input
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="Project (e.g. Brand shoots)"
              aria-label="Project"
              className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
            />
          )}
          <div className="flex justify-end">
            <TextButton onClick={save} disabled={saving || !draft.trim()}>
              <span className="flex items-center gap-1">
                <Plus size={13} /> Save memory
              </span>
            </TextButton>
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <EmptyState>Loading memory…</EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState>Nothing saved in this category yet.</EmptyState>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--color-border-subtle)' }}>
              {visible.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
                      {entry.content}
                    </p>
                    <div className="text-[11px] mt-1 flex flex-wrap gap-2" style={{ color: 'var(--color-text-tertiary)' }}>
                      <span>{entry.source}</span>
                      {entry.project && <span>{entry.project}</span>}
                      <span>{formatDate(entry.created_at)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setPendingDelete(entry)}
                    aria-label="Forget this memory"
                    className="p-1 rounded cursor-pointer shrink-0"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Forget this memory?"
        body={
          pendingDelete
            ? `“${pendingDelete.content.slice(0, 120)}” will be permanently removed from your memory.`
            : ''
        }
        confirmLabel="Forget"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

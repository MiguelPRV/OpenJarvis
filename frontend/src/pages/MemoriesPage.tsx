import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Brain,
  Check,
  Loader2,
  PauseCircle,
  Pencil,
  PlayCircle,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteMemoryFact,
  fetchMemoryFacts,
  setMemoryExtraction,
  updateMemoryFact,
} from '../lib/api';
import type { MemoryExtractionStatus, MemoryFact } from '../lib/api';

const TRUST_LABEL: Record<string, { label: string; color: string }> = {
  trusted: { label: 'Reviewed', color: 'var(--color-success)' },
  auto: { label: 'Learned', color: 'var(--color-text-tertiary)' },
  '': { label: 'Learned', color: 'var(--color-text-tertiary)' },
  untrusted: { label: 'Quarantined', color: 'var(--color-warning)' },
};

function trustBadge(fact: MemoryFact) {
  return TRUST_LABEL[fact.trust] ?? { label: fact.trust, color: 'var(--color-text-tertiary)' };
}

function formatLearned(createdAt: number): string {
  if (!createdAt) return '';
  const date = new Date(createdAt * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function FactRow({
  fact,
  onChanged,
  onDeleted,
  onError,
}: {
  fact: MemoryFact;
  onChanged: (fact: MemoryFact) => void;
  onDeleted: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.text);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const badge = trustBadge(fact);

  const startEditing = () => {
    setDraft(fact.text);
    setEditing(true);
  };

  const save = async () => {
    const text = draft.trim();
    if (!text || text === fact.text) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const { fact: updated } = await updateMemoryFact(fact.index, {
        text,
        expected_text: fact.text,
      });
      onChanged(updated);
      setEditing(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to update memory');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteMemoryFact(fact.index, fact.text);
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete memory');
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-xl p-4 transition-colors"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {editing ? (
        <div className="flex flex-col gap-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            autoFocus
            className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={busy || !draft.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              style={{ background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
            >
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>
              {fact.text}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={startEditing}
                aria-label="Edit memory"
                className="p-1.5 rounded-lg transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-tertiary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                aria-label="Delete memory"
                className="p-1.5 rounded-lg transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-tertiary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {confirmingDelete && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Forget this memory?
              </span>
              <button
                onClick={remove}
                disabled={busy}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50"
                style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={busy}
                className="px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
              >
                Cancel
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            <span style={{ color: badge.color }}>{badge.label}</span>
            {formatLearned(fact.created_at) && <span>Learned {formatLearned(fact.created_at)}</span>}
            {fact.source && <span>From {fact.source}</span>}
          </div>
        </>
      )}
    </div>
  );
}

export function MemoriesPage() {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [extraction, setExtraction] = useState<MemoryExtractionStatus>({ enabled: false, running: false });
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMemoryFacts();
      setFacts(data.facts);
      setExtraction(data.extraction);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return facts;
    return facts.filter(
      (fact) =>
        fact.text.toLowerCase().includes(needle) ||
        fact.source.toLowerCase().includes(needle),
    );
  }, [facts, query]);

  const toggleExtraction = async () => {
    setToggling(true);
    try {
      const status = await setMemoryExtraction(extraction.running);
      setExtraction(status);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change memory extraction');
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-6 py-10">
      <div className="max-w-4xl mx-auto w-full flex flex-col flex-1 overflow-hidden">
        <header className="mb-6 shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              <Brain size={18} style={{ color: 'var(--color-accent)' }} />
              Memories
            </h1>
            <button
              onClick={toggleExtraction}
              disabled={toggling || !extraction.enabled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
            >
              {toggling ? (
                <Loader2 size={12} className="animate-spin" />
              ) : extraction.running ? (
                <PauseCircle size={12} />
              ) : (
                <PlayCircle size={12} />
              )}
              {extraction.running ? 'Pause learning' : 'Resume learning'}
            </button>
          </div>
          <p className="text-sm mt-2 max-w-2xl" style={{ color: 'var(--color-text-secondary)' }}>
            What Jarvis has learned about you from conversations. Correct anything that is wrong, or forget it entirely.
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
            {loading
              ? 'Loading memories…'
              : extraction.enabled
                ? extraction.running
                  ? `${facts.length} ${facts.length === 1 ? 'memory' : 'memories'} · learning from new conversations`
                  : `${facts.length} ${facts.length === 1 ? 'memory' : 'memories'} · learning paused`
                : `${facts.length} ${facts.length === 1 ? 'memory' : 'memories'} · learning is off on this server`}
          </p>
        </header>

        <div className="relative mb-4 shrink-0">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-text-tertiary)' }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memories"
            aria-label="Search memories"
            className="w-full rounded-lg pl-9 pr-3 py-2 text-sm outline-none"
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }}
          />
        </div>

        {error && (
          <div
            className="mb-4 rounded-lg px-3 py-2 text-xs shrink-0"
            style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}
          >
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-16" style={{ color: 'var(--color-text-tertiary)' }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <div
              className="text-center py-16 rounded-xl"
              style={{ color: 'var(--color-text-tertiary)', border: '1px dashed var(--color-border)' }}
            >
              {facts.length === 0
                ? extraction.enabled
                  ? 'Nothing learned yet. Chat with Jarvis and it will remember durable details about you.'
                  : 'Nothing learned yet. Background learning is off on this server.'
                : 'No memories match your search.'}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 pb-4">
              {visible.map((fact) => (
                <FactRow
                  key={`${fact.index}-${fact.text}`}
                  fact={fact}
                  onChanged={(updated) => {
                    setFacts((prev) =>
                      prev.map((item) => (item.text === fact.text ? updated : item)),
                    );
                    void load();
                  }}
                  onDeleted={() => void load()}
                  onError={setError}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

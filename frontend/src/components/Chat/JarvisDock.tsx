import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  ArrowUpRight,
  Maximize2,
  Minimize2,
  Minus,
  Sparkles,
  X,
} from 'lucide-react';
import { ChatArea } from './ChatArea';
import { JarvisContextRail } from './JarvisContextRail';
import { buildAssistantContext, contextForLocation } from '../../lib/page-context';
import { useAppStore } from '../../lib/store';

type DockMode = 'closed' | 'minimized' | 'open' | 'expanded';

const IS_MAC =
  typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

/**
 * Jarvis, everywhere.
 *
 * Rendered from the Layout, so it survives route changes: the conversation,
 * the in-flight stream and the composer draft all come from the shared store
 * and the same ChatArea the chat page uses — this is a second surface, not a
 * second chat system. It stays hidden on the chat page, where the full
 * conversation is already on screen.
 *
 * Each request carries the current page as a transient system message
 * (see `page-context.ts`), so a short follow-up is read against what the user
 * is looking at.
 */
export function JarvisDock() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<DockMode>('closed');
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const selectedModel = useAppStore((s) => s.selectedModel);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const isStreaming = useAppStore((s) => s.streamState.isStreaming);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );

  const onChatPage = location.pathname === '/';
  const context = useMemo(
    () => contextForLocation(location.pathname, location.search),
    [location.pathname, location.search],
  );
  const pageContext = useMemo(() => buildAssistantContext(context), [context]);

  // Entering the chat page shows the full conversation; a dock beside it would
  // only duplicate the same assistant.
  useEffect(() => {
    if (onChatPage) setMode('closed');
  }, [onChatPage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        if (onChatPage) return;
        e.preventDefault();
        setMode((current) =>
          current === 'closed' || current === 'minimized' ? 'open' : 'closed',
        );
      } else if (e.key === 'Escape') {
        setMode((current) => (current === 'closed' ? current : 'closed'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onChatPage]);

  // A soft keyboard shrinks the visual viewport. While it is up the page's own
  // input is what the user is typing into, so the launcher steps out of the way
  // instead of sitting on top of it.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      setKeyboardOpen(window.innerHeight - viewport.height > 140);
    };
    update();
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  if (onChatPage) return null;

  // Keep the launcher out of the way of what the user is doing: a soft
  // keyboard on phones, and the open navigation drawer (whose scrim is inside
  // the page stacking context, so the launcher would otherwise float over it).
  const launcherHidden = keyboardOpen || (narrow && sidebarOpen);
  const modelLabel = selectedModel || serverInfo?.model || 'Select model';
  const isOpen = mode === 'open' || mode === 'expanded';
  const isExpanded = mode === 'expanded';
  const shortcut = IS_MAC ? '⌘J' : 'Ctrl+J';

  const close = () => setMode('closed');

  return (
    <>
      {/* Launcher — hidden while a soft keyboard covers the page. */}
      {mode === 'closed' && !launcherHidden && (
        <button
          type="button"
          onClick={() => setMode('open')}
          aria-label="Ask Jarvis"
          aria-keyshortcuts="Meta+J Control+J"
          title={`Ask Jarvis (${shortcut})`}
          className="fixed right-4 z-10 flex items-center gap-2 p-3 sm:pl-2.5 sm:pr-3.5 sm:py-2 rounded-full text-sm font-medium cursor-pointer transition-transform hover:scale-[1.03]"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}
          >
            <Sparkles size={14} />
          </span>
          <span className="hidden sm:inline">Ask Jarvis</span>
          {isStreaming ? (
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              aria-label="Jarvis is replying"
              style={{ background: 'var(--color-accent)' }}
            />
          ) : (
            <kbd
              className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
            >
              {shortcut}
            </kbd>
          )}
        </button>
      )}

      {/* Minimized — the conversation stays live, the panel just gets out of
          the way. */}
      {mode === 'minimized' && !launcherHidden && (
        <div
          role="status"
          className="fixed right-4 z-10 flex items-center gap-1 pl-2 pr-1 py-1.5 rounded-full"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <button
            type="button"
            onClick={() => setMode('open')}
            aria-label="Reopen Jarvis"
            className="flex items-center gap-2 pr-2 text-sm cursor-pointer"
            style={{ color: 'var(--color-text)' }}
          >
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}
            >
              <Sparkles size={14} />
            </span>
            Jarvis
            {isStreaming && (
              <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                replying…
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setMode('open')}
            aria-label="Expand Jarvis"
            title="Expand"
            className="p-1.5 rounded-full cursor-pointer"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <Maximize2 size={13} />
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Close Jarvis"
            title="Close"
            className="p-1.5 rounded-full cursor-pointer"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[45] flex items-stretch sm:items-end sm:justify-end sm:p-4">
          {/* Phones get a full-screen sheet; the scrim only exists there. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 sm:hidden"
            style={{ background: 'rgba(0, 0, 0, 0.45)' }}
            onClick={close}
          />
          <div
            role="dialog"
            aria-label="Jarvis assistant"
            aria-modal="true"
            className={[
              'relative flex flex-col w-full overflow-hidden',
              // 100dvh: the sheet follows the visual viewport, so the composer
              // stays above the mobile keyboard instead of behind it.
              'h-[100dvh]',
              'sm:rounded-xl',
              isExpanded
                ? 'sm:w-[min(1000px,calc(100vw-2rem))] sm:h-[min(760px,calc(100dvh-2rem))]'
                : 'sm:w-[420px] sm:h-[min(680px,calc(100dvh-2rem))]',
            ].join(' ')}
            style={{
              paddingTop: 'env(safe-area-inset-top, 0px)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div
              className="flex items-center gap-2 px-3 py-2.5 shrink-0"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}
              >
                <Sparkles size={15} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold leading-tight" style={{ color: 'var(--color-text)' }}>
                  Jarvis
                </div>
                <div className="text-[11px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                  {context.label} · {modelLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMode('minimized')}
                aria-label="Minimize Jarvis"
                title="Minimize"
                className="p-1.5 rounded-md cursor-pointer"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <Minus size={16} />
              </button>
              <button
                type="button"
                onClick={() => setMode(isExpanded ? 'open' : 'expanded')}
                aria-label={isExpanded ? 'Collapse Jarvis' : 'Expand Jarvis'}
                title={isExpanded ? 'Collapse' : 'Expand'}
                className="hidden sm:inline-flex p-1.5 rounded-md cursor-pointer"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('closed');
                  navigate('/');
                }}
                aria-label="Open the full chat page"
                title="Open full chat"
                className="p-1.5 rounded-md cursor-pointer"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <ArrowUpRight size={16} />
              </button>
              <button
                type="button"
                onClick={close}
                aria-label="Close Jarvis"
                title={`Close (Esc)`}
                className="p-1.5 rounded-md cursor-pointer"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-1 min-h-0">
              <div className="flex-1 min-w-0 min-h-0">
                <ChatArea compact pageContext={pageContext} />
              </div>
              {isExpanded && <JarvisContextRail context={context} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

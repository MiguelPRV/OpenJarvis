import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Maximize2, Sparkles, X } from 'lucide-react';
import { ChatArea } from './ChatArea';
import { useAppStore } from '../../lib/store';

/**
 * Jarvis, everywhere.
 *
 * Rendered from the Layout, so it is mounted on every route. On the chat page
 * the full conversation is already on screen and the dock stays hidden; on any
 * other route a launcher opens the same conversation in a dock. Both surfaces
 * read the conversation and stream state from the shared store, so a reply that
 * is still streaming keeps going while the user moves around the app.
 */
export function JarvisDock() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const serverInfo = useAppStore((s) => s.serverInfo);

  const onChatPage = location.pathname === '/';

  // Entering the chat page shows the full conversation; the dock would only
  // duplicate it.
  useEffect(() => {
    if (onChatPage) setOpen(false);
  }, [onChatPage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        if (onChatPage) return;
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onChatPage]);

  if (onChatPage) return null;

  const modelLabel = selectedModel || serverInfo?.model || 'Select model';

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask Jarvis"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full text-sm font-medium cursor-pointer transition-transform hover:scale-[1.03]"
          style={{
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
          Ask Jarvis
          <kbd
            className="text-[10px] px-1.5 py-0.5 rounded font-mono"
            style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
          >
            ⌘J
          </kbd>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Jarvis"
          className="fixed inset-0 z-40 flex items-stretch justify-end sm:inset-auto sm:bottom-4 sm:right-4 sm:items-end"
        >
          {/* On phones the dock takes the screen; the scrim only exists there. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 sm:hidden"
            style={{ background: 'rgba(0, 0, 0, 0.4)' }}
            onClick={() => setOpen(false)}
          />
          <div
            className="relative flex flex-col w-full h-full sm:w-[420px] sm:h-[min(680px,calc(100vh-2rem))] overflow-hidden sm:rounded-xl"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div
              className="flex items-center gap-2 px-4 py-3 shrink-0"
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
                  {modelLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/');
                }}
                title="Open full chat"
                aria-label="Open full chat"
                className="p-1.5 rounded-md cursor-pointer"
                style={{ color: 'var(--color-text-tertiary)', background: 'transparent' }}
              >
                <Maximize2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close Jarvis (Esc)"
                aria-label="Close Jarvis"
                className="p-1.5 rounded-md cursor-pointer"
                style={{ color: 'var(--color-text-tertiary)', background: 'transparent' }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ChatArea compact />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

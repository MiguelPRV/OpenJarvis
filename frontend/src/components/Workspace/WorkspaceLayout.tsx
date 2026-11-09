import { Outlet, useLocation, useNavigate } from 'react-router';
import { Briefcase, CalendarDays, ListChecks, Plug, Sparkles } from 'lucide-react';

const TABS = [
  { path: '/workspace', label: 'Today', icon: Briefcase },
  { path: '/workspace/tasks', label: 'Tasks', icon: ListChecks },
  { path: '/workspace/memory', label: 'Memory', icon: CalendarDays },
  { path: '/workspace/assistant', label: 'Assistant', icon: Sparkles },
  { path: '/workspace/integrations', label: 'Integrations', icon: Plug },
];

export function WorkspaceLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="px-6 pt-8 pb-2 shrink-0">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div
                className="text-[11px] uppercase tracking-[0.16em]"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Business workspace
              </div>
              <h1 className="text-xl font-semibold mt-1" style={{ color: 'var(--color-text)' }}>
                J&amp;M Visuals
              </h1>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Photo &amp; video production studio — tasks, memory and client work in one place.
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap gap-1 mt-5" aria-label="Workspace sections">
            {TABS.map((tab) => {
              const active =
                tab.path === '/workspace'
                  ? location.pathname === '/workspace'
                  : location.pathname.startsWith(tab.path);
              return (
                <button
                  key={tab.path}
                  onClick={() => navigate(tab.path)}
                  aria-current={active ? 'page' : undefined}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer"
                  style={{
                    background: active ? 'var(--color-accent-subtle)' : 'transparent',
                    color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
                    border: `1px solid ${active ? 'var(--color-accent-glow)' : 'transparent'}`,
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  <tab.icon size={14} style={active ? { color: 'var(--color-accent)' } : undefined} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-12">
        <div className="max-w-5xl mx-auto pt-4">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

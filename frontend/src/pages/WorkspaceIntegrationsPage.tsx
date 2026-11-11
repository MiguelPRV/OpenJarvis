import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertCircle, KeyRound, Plug, RefreshCw } from 'lucide-react';
import { fetchIntegrations, type Integration } from '../lib/workspace-api';
import {
  EmptyState,
  IntegrationStatusBadge,
  Panel,
  formatDateTime,
} from '../components/Workspace/ui';

export function WorkspaceIntegrationsPage() {
  const navigate = useNavigate();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    try {
      setIntegrations(await fetchIntegrations());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load integrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm max-w-xl" style={{ color: 'var(--color-text-secondary)' }}>
          Credentials stay on the server. Anything that sends or syncs is user-initiated, and the
          assistant always asks before it acts on an external account.
        </p>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer shrink-0"
          style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && (
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <EmptyState>Checking integrations…</EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {integrations.map((integration) => {
            const connectedConnector = integration.connectors.find((c) => c.connected);
            return (
              <Panel key={integration.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <Plug size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--color-text-secondary)' }} />
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                        {integration.name}
                      </h3>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                        {integration.description}
                      </p>
                    </div>
                  </div>
                  <IntegrationStatusBadge status={integration.status} />
                </div>

                <div className="mt-3 space-y-1.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {integration.last_sync && (
                    <div>Last sync {formatDateTime(integration.last_sync)}</div>
                  )}
                  {integration.errors.filter(Boolean).length > 0 && (
                    <div className="flex items-start gap-1.5" style={{ color: 'var(--color-error)' }}>
                      <AlertCircle size={12} className="mt-0.5 shrink-0" />
                      <span>{integration.errors.filter(Boolean).join(' · ')}</span>
                    </div>
                  )}
                  {integration.status === 'not_connected' && (
                    <div className="flex items-start gap-1.5">
                      <KeyRound size={12} className="mt-0.5 shrink-0" />
                      <span>{integration.credential}</span>
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  {integration.connectors.length > 0 ? (
                    <button
                      onClick={() => navigate('/data-sources')}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                      style={{
                        background: integration.status === 'not_connected' ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                        color: integration.status === 'not_connected' ? 'var(--color-on-accent)' : 'var(--color-text-secondary)',
                        border: integration.status === 'not_connected' ? 'none' : '1px solid var(--color-border)',
                      }}
                    >
                      {integration.status === 'not_connected'
                        ? 'Connect in Data Sources'
                        : `${connectedConnector ? 'Manage' : 'Open'} in Data Sources`}
                    </button>
                  ) : (
                    <span
                      className="inline-block px-2 py-1 rounded text-[11px]"
                      style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}
                    >
                      Needs {integration.credential} — no connector yet
                    </span>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}

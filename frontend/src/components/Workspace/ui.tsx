import type { ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { IntegrationStatus, MemoryCategory, Priority } from '../../lib/workspace-api';

export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl p-4 ${className}`}
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          {title && (
            <h2 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm py-3" style={{ color: 'var(--color-text-tertiary)' }}>
      {children}
    </p>
  );
}

const PRIORITY_STYLE: Record<Priority, { color: string; bg: string; label: string }> = {
  urgent: { color: 'var(--color-error)', bg: 'color-mix(in srgb, var(--color-error) 12%, transparent)', label: 'Urgent' },
  high: { color: 'var(--color-accent-amber)', bg: 'var(--color-accent-amber-subtle)', label: 'High' },
  medium: { color: 'var(--color-text-secondary)', bg: 'var(--color-bg-tertiary)', label: 'Medium' },
  low: { color: 'var(--color-text-tertiary)', bg: 'var(--color-bg-secondary)', label: 'Low' },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const style = PRIORITY_STYLE[priority];
  return (
    <span
      className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ color: style.color, background: style.bg }}
    >
      {style.label}
    </span>
  );
}

const INTEGRATION_STYLE: Record<IntegrationStatus, { color: string; bg: string; label: string }> = {
  connected: { color: 'var(--color-success)', bg: 'color-mix(in srgb, var(--color-success) 12%, transparent)', label: 'Connected' },
  not_connected: { color: 'var(--color-text-tertiary)', bg: 'var(--color-bg-tertiary)', label: 'Not connected' },
  syncing: { color: 'var(--color-accent)', bg: 'var(--color-accent-subtle)', label: 'Syncing' },
  error: { color: 'var(--color-error)', bg: 'color-mix(in srgb, var(--color-error) 12%, transparent)', label: 'Error' },
};

export function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  const style = INTEGRATION_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ color: style.color, background: style.bg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: style.color }} />
      {style.label}
    </span>
  );
}

export const MEMORY_LABELS: Record<MemoryCategory, string> = {
  personal: 'Personal',
  business: 'Business',
  project: 'Project',
  preference: 'Preferences',
};

export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-sm rounded-xl p-5"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {title}
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              {body}
            </p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="ml-auto p-1 rounded cursor-pointer"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-sm cursor-pointer"
            style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
            style={{ background: 'var(--color-error)', color: '#fff' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TextButton({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
    >
      {children}
    </button>
  );
}

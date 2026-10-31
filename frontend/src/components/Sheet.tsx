import type { ReactNode } from 'react';

export function Sheet({ open, onClose, children, title, sub }: { open: boolean; onClose: () => void; children: ReactNode; title?: string; sub?: string }) {
  if (!open) return null;
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <span className="grabber" />
        {title && (
          <header className="sheet-head">
            <h3>{title}</h3>
            {sub && <p className="muted">{sub}</p>}
          </header>
        )}
        {children}
      </div>
    </div>
  );
}

export interface Action {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function ActionSheet({ open, onClose, title, actions }: { open: boolean; onClose: () => void; title?: string; actions: Action[] }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="actions">
        {actions.map((a) => (
          <button
            key={a.label}
            className={`action ${a.danger ? 'danger' : ''}`}
            disabled={a.disabled}
            onClick={() => {
              onClose();
              a.onClick();
            }}
          >
            {a.label}
          </button>
        ))}
        <button className="action muted" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}

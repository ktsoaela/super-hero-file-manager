'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Stark-styled right-click menu. `items` is a list of
 * { label, hint?, onSelect?, danger?, disabled?, children?: items } or 'sep'.
 */
export default function ContextMenu({ x, y, title, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [open, setOpen] = useState(null);
  const [cursor, setCursor] = useState(-1);
  const actionable = items.map((it, i) => (it !== 'sep' && !it.disabled ? i : -1)).filter((i) => i >= 0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { innerWidth: w, innerHeight: h } = window;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.min(x, w - r.width - 6), top: Math.min(y, h - r.height - 6) });
  }, [x, y]);

  useEffect(() => {
    const down = (event) => {
      if (!ref.current?.contains(event.target)) onClose();
    };
    const key = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setCursor((c) => {
          const at = actionable.indexOf(c);
          const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
          return actionable[(next + actionable.length) % actionable.length];
        });
      } else if (event.key === 'Enter' && cursor >= 0) {
        event.preventDefault();
        event.stopPropagation();
        const item = items[cursor];
        if (item.children) setOpen(cursor);
        else {
          onClose();
          item.onSelect?.();
        }
      }
    };
    const blur = () => onClose();
    window.addEventListener('mousedown', down, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', blur);
    window.addEventListener('resize', blur);
    return () => {
      window.removeEventListener('mousedown', down, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', blur);
      window.removeEventListener('resize', blur);
    };
  }, [onClose, items, cursor, actionable]);

  return (
    <div ref={ref} className="ctx" role="menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
      {title && <p className="ctx-title">{title}</p>}
      {items.map((item, i) =>
        item === 'sep' ? (
          <hr key={`sep${i}`} className="ctx-sep" />
        ) : (
          <div key={item.label} className="ctx-wrap" onMouseEnter={() => setOpen(item.children ? i : null)}>
            <button
              type="button"
              role="menuitem"
              className={`ctx-item${item.danger ? ' is-danger' : ''}${cursor === i ? ' is-cursor' : ''}`}
              disabled={item.disabled}
              onMouseEnter={() => setCursor(i)}
              onClick={() => {
                if (item.children) {
                  setOpen(open === i ? null : i);
                  return;
                }
                onClose();
                item.onSelect?.();
              }}
            >
              <span>{item.label}</span>
              {item.children ? <span className="ctx-hint">▸</span> : item.hint && <span className="ctx-hint">{item.hint}</span>}
            </button>
            {item.children && open === i && (
              <div className="ctx ctx-sub" role="menu">
                {item.children.length === 0 && <p className="ctx-title">NONE_AVAILABLE</p>}
                {item.children.map((child) => (
                  <button
                    key={child.label}
                    type="button"
                    role="menuitem"
                    className="ctx-item"
                    disabled={child.disabled}
                    onClick={() => {
                      onClose();
                      child.onSelect?.();
                    }}
                  >
                    <span>{child.label}</span>
                    {child.hint && <span className="ctx-hint">{child.hint}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

/** Small modal used for rename and delete confirmation. */
export function Dialog({ title, message, initial, confirmLabel, danger, onConfirm, onCancel }) {
  const [value, setValue] = useState(initial ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    const dot = initial?.lastIndexOf('.');
    el.setSelectionRange(0, dot > 0 ? dot : initial?.length ?? 0);
  }, [initial]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const result = await onConfirm(value);
    setBusy(false);
    if (result && !result.ok) setError(result.message || 'FAILED');
  };

  return (
    <div className="dialog-scrim" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className={`dialog${danger ? ' is-danger' : ''}`}
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
      >
        <p className="dialog-title">{title}</p>
        {message && <p className="dialog-msg">{message}</p>}
        {initial != null && (
          <input
            ref={input}
            className="dialog-input"
            value={value}
            spellCheck={false}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
          />
        )}
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="bar-btn" onClick={onCancel}>
            CANCEL
          </button>
          <button type="submit" className={`dialog-ok${danger ? ' is-danger' : ''}`} disabled={busy} autoFocus={initial == null}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

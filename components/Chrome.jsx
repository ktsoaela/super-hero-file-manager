'use client';

import { useEffect, useState } from 'react';
import { formatBytes } from '../lib/format';

export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const two = (n) => String(n).padStart(2, '0');
  return (
    <span className="clock">
      {now.getFullYear()}.{two(now.getMonth() + 1)}.{two(now.getDate())} · {two(now.getHours())}:{two(now.getMinutes())}:
      {two(now.getSeconds())}
    </span>
  );
}

const THEME_ICONS = {
  system: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 2a6 6 0 0 1 0 12Z" fill="currentColor" />
    </svg>
  ),
  light: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="3" fill="currentColor" />
      <path
        d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10.5 2.2A6 6 0 1 0 13.8 10 4.8 4.8 0 0 1 10.5 2.2Z" fill="currentColor" />
    </svg>
  ),
};

export function ThemeSwitch({ theme }) {
  return (
    <div className="theme-switch" role="group" aria-label="Theme">
      {theme.modes.map((mode) => (
        <button
          key={mode}
          type="button"
          className={theme.mode === mode ? 'is-on' : undefined}
          aria-pressed={theme.mode === mode}
          title={mode === 'system' ? 'Follow Windows (system default)' : `${mode[0].toUpperCase()}${mode.slice(1)} mode`}
          onClick={() => theme.choose(mode)}
        >
          {THEME_ICONS[mode]}
          <span>{mode === 'system' ? 'SYS' : mode === 'light' ? 'LT' : 'DK'}</span>
        </button>
      ))}
    </div>
  );
}

/** Hides everything behind a logo; background work (transfers) keeps running. */
export function Screensaver({ onWake }) {
  useEffect(() => {
    const wake = () => onWake();
    const timer = setTimeout(() => {
      window.addEventListener('keydown', wake, { once: true });
      window.addEventListener('mousedown', wake, { once: true });
    }, 300);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('mousedown', wake);
    };
  }, [onWake]);

  return (
    <div className="saver" aria-label="Screensaver — press any key">
      <div className="saver-logo">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
          <circle cx="60" cy="60" r="40" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray="14 7" />
          <circle cx="60" cy="60" r="18" fill="currentColor" opacity="0.85" />
        </svg>
        <p>
          STARK<span>INDUSTRIES</span>
        </p>
      </div>
    </div>
  );
}

export function TransferStatus({ transfer, onCancel, onDismiss }) {
  const running = transfer.phase === 'scanning' || transfer.phase === 'copying';

  useEffect(() => {
    if (running) return undefined;
    const id = setTimeout(onDismiss, 9000);
    return () => clearTimeout(id);
  }, [running, onDismiss]);

  const pct = transfer.total ? Math.min(100, Math.round((transfer.copied / transfer.total) * 100)) : 0;
  let text;
  if (transfer.phase === 'scanning') text = `TRANSFER · SCANNING ${transfer.fileCount || 0} FILES…`;
  else if (transfer.phase === 'copying')
    text = `TRANSFER ${pct}% · ${formatBytes(transfer.copied)} / ${formatBytes(transfer.total)} · ${transfer.filesDone}/${transfer.fileCount}`;
  else if (transfer.phase === 'done')
    text = `TRANSFER_COMPLETE · ${transfer.filesDone} FILES → ${transfer.dest}${transfer.failed ? ` · ${transfer.failed} SKIPPED` : ''}`;
  else if (transfer.phase === 'cancelled') text = 'TRANSFER_CANCELLED';
  else text = `TRANSFER_FAILED · ${transfer.current || ''}`;

  return (
    <span className={`transfer is-${transfer.phase}`} title={transfer.current ? `Copying ${transfer.current}` : undefined}>
      {running && (
        <span className="transfer-meter" aria-hidden="true">
          <i style={{ width: `${transfer.phase === 'scanning' ? 8 : pct}%` }} />
        </span>
      )}
      <span className="transfer-text">{text}</span>
      {running ? (
        <button type="button" className="bar-btn" onClick={onCancel}>
          CANCEL
        </button>
      ) : (
        <button type="button" className="bar-btn" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      )}
    </span>
  );
}


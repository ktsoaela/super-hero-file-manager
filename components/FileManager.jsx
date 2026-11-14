'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DirectoryColumn from './DirectoryColumn';
import DesktopColumn from './DesktopColumn';
import FolderStack from './FolderStack';
import { useFileSystem } from '../lib/useFileSystem';
import { formatBytes, knownTotal, samePath, toCode } from '../lib/format';

function Clock() {
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

export default function FileManager() {
  const fsys = useFileSystem();
  const { current, folders, measuring, openDirectory } = fsys;
  const [focusPath, setFocusPath] = useState(null);
  const lastWheel = useRef(0);

  useEffect(() => setFocusPath(null), [current?.path]);

  const focusIndex = useMemo(() => {
    const index = focusPath ? folders.findIndex((f) => samePath(f.path, focusPath)) : 0;
    return Math.max(0, index);
  }, [folders, focusPath]);
  const focused = folders[focusIndex];

  const step = useCallback(
    (delta) => {
      if (!folders.length) return;
      const next = Math.min(folders.length - 1, Math.max(0, focusIndex + delta));
      setFocusPath(folders[next].path);
    },
    [folders, focusIndex]
  );

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
      } else if (event.key === 'Enter' && focused) {
        event.preventDefault();
        openDirectory(focused.path);
      } else if (event.key === 'Backspace' && current?.parent) {
        event.preventDefault();
        openDirectory(current.parent);
      } else if (event.key === 'F5') {
        event.preventDefault();
        fsys.refresh();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, focused, current, openDirectory, fsys]);

  const onWheel = (event) => {
    const now = performance.now();
    if (now - lastWheel.current < 110) return;
    lastWheel.current = now;
    step(event.deltaY > 0 ? 1 : -1);
  };

  const total = knownTotal(folders);
  const status = fsys.reading
    ? 'READING_FOLDER…'
    : measuring.inside || measuring.desktop
      ? 'MEASURING_SIZES…'
      : 'READY';

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">
          STARK<span className="brand-sub">INDUSTRIES</span>
        </span>
        <span className="topbar-rule" />
        <nav className="crumbs" aria-label="Current path">
          {current?.ancestry.map((part, i) => (
            <span key={part.path} className="crumb-wrap">
              {i > 0 && <span className="crumb-sep">/</span>}
              <button type="button" className="crumb" title={part.path} onClick={() => openDirectory(part.path)}>
                {toCode(part.name)}
              </button>
            </span>
          ))}
        </nav>
        <span className="spacer" />
        <Clock />
      </header>

      <main className="bezel">
        <div className="glass">
          <div className="glass-sheen" aria-hidden="true" />
          <DirectoryColumn
            roots={fsys.roots}
            current={current}
            folders={folders}
            focusPath={focused?.path}
            onSelect={setFocusPath}
            onOpen={openDirectory}
          />

          <section className="col col-stack" aria-label="Folders inside, largest first" onWheel={onWheel}>
            <p className="stack-code" key={current?.path || 'loading'}>
              {current ? `${toCode(current.name)}_${String(folders.length).padStart(3, '0')}` : 'LOADING'}
            </p>
            <div className="stack-glow" aria-hidden="true" />
            {folders.length > 0 ? (
              <FolderStack folders={folders} focusIndex={focusIndex} onFocus={(i) => setFocusPath(folders[i].path)} onOpen={openDirectory} />
            ) : (
              <p className="stack-empty">{current ? 'NO_FOLDERS_INSIDE' : 'READING…'}</p>
            )}
            <div className="stack-foot">
              <span>LARGEST → SMALLEST</span>
              {focused && (
                <span>
                  {String(focusIndex + 1).padStart(2, '0')} / {String(folders.length).padStart(2, '0')} ·{' '}
                  {focused.error ? 'NO ACCESS' : formatBytes(focused.bytes)}
                </span>
              )}
              <span>
                TOTAL {formatBytes(total)}
                {measuring.inside ? '…' : ''}
              </span>
            </div>
          </section>

          <DesktopColumn
            folders={fsys.desktopFolders}
            measuring={measuring.desktop}
            currentPath={current?.path}
            onOpen={openDirectory}
          />
        </div>
      </main>

      <footer className="bottombar">
        <button
          type="button"
          className="chev"
          title="Up one folder (Backspace)"
          disabled={!current?.parent}
          onClick={() => openDirectory(current.parent)}
        >
          ❯
        </button>
        <span className={`status${status === 'READY' ? '' : ' is-busy'}`}>
          {status}
          <span className="caret" aria-hidden="true" />
        </span>
        {current && (
          <span className="meta">
            {String(folders.length).padStart(3, '0')} DIR · {String(current.fileCount ?? 0).padStart(3, '0')} FILE
          </span>
        )}
        {fsys.banner && <span className="banner" role="alert">{fsys.banner}</span>}
        <span className="spacer" />
        <span className="hint">↑↓ SELECT · ENTER OPEN · ⌫ BACK</span>
        <button type="button" className="bar-btn" title="Refresh (F5)" onClick={fsys.refresh}>
          REFRESH
        </button>
        <button type="button" className="bar-btn" disabled={!current} onClick={() => fsys.openInExplorer(current.path)}>
          EXPLORER
        </button>
      </footer>
    </div>
  );
}

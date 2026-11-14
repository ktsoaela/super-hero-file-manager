'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DirectoryColumn from './DirectoryColumn';
import DesktopColumn from './DesktopColumn';
import FolderStack from './FolderStack';
import { useFileSystem } from '../lib/useFileSystem';
import { formatBytes, knownTotal, samePath, toCode } from '../lib/format';

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
        <span className="brand">STARK</span>
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
      </header>

      <main className="bezel">
        <div className="glass">
          <DirectoryColumn
            roots={fsys.roots}
            current={current}
            folders={folders}
            focusPath={focused?.path}
            onSelect={setFocusPath}
            onOpen={openDirectory}
          />

          <section className="col col-stack" aria-label="Folders inside, largest first" onWheel={onWheel}>
            <p className="stack-code">
              {current ? `${toCode(current.name)}_${String(folders.length).padStart(3, '0')}` : 'LOADING'}
            </p>
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
        <span className="status">{status}</span>
        {fsys.banner && <span className="banner" role="alert">{fsys.banner}</span>}
        <span className="spacer" />
        <button type="button" className="bar-btn" onClick={fsys.refresh}>
          REFRESH
        </button>
        <button type="button" className="bar-btn" disabled={!current} onClick={() => fsys.openInExplorer(current.path)}>
          EXPLORER
        </button>
      </footer>
    </div>
  );
}

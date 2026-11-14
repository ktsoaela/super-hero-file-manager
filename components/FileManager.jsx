'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DirectoryColumn from './DirectoryColumn';
import RightRail from './RightRail';
import FolderStack from './FolderStack';
import PreviewSpread from './PreviewSpread';
import FileStage from './FileStage';
import ContextMenu, { Dialog } from './ContextMenu';
import { Clock, Screensaver, ThemeSwitch, TransferStatus } from './Chrome';
import { useFileSystem } from '../lib/useFileSystem';
import { useTerminal } from '../lib/useTerminal';
import { useTheme } from '../lib/useTheme';
import { TermLog, TermPrompt } from './Terminal';
import { formatBytes, isDir, knownTotal, samePath, toCode } from '../lib/format';

const parentOf = (p) => {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  if (i <= 0) return p;
  return i === 2 && p[1] === ':' ? p.slice(0, 3) : p.slice(0, i);
};

function FindBar({ find, count, search, inputRef, onChange, onToggleDeep, onKey, onClose }) {
  const running = find.deep && search?.running;
  return (
    <span className="find" role="search">
      <span className="find-tag">FIND</span>
      <input
        ref={inputRef}
        className="find-input"
        value={find.query}
        placeholder={find.deep ? 'search all subfolders…' : 'search this folder…'}
        spellCheck={false}
        aria-label="Find"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
      />
      <button
        type="button"
        className={`find-mode${find.deep ? ' is-deep' : ''}`}
        title="Tab: switch between this folder and all subfolders"
        onClick={onToggleDeep}
      >
        {find.deep ? 'DEEP' : 'HERE'}
      </button>
      <span className="find-count">
        {find.query.trim().length < (find.deep ? 2 : 1)
          ? find.deep
            ? 'TYPE 2+ CHARS'
            : ''
          : `${String(count).padStart(3, '0')} MATCH${count === 1 ? '' : 'ES'}${running ? ` · SCANNING ${search.scanned}…` : ''}`}
      </span>
      <button type="button" className="find-close" title="Close find (Esc)" onClick={onClose}>
        ✕
      </button>
    </span>
  );
}

export default function FileManager() {
  const fsys = useFileSystem();
  const theme = useTheme();
  const { current, entries, measuring, openDirectory, transfer } = fsys;
  const term = useTerminal({ openDirectory, refresh: fsys.refresh });
  const [focusPath, setFocusPath] = useState(null);
  const [staging, setStaging] = useState(false);
  const [arming, setArming] = useState(null);
  const [saver, setSaver] = useState(false);
  const [find, setFind] = useState({ open: false, query: '', deep: false });
  const [menu, setMenu] = useState(null);
  const [dialog, setDialog] = useState(null);
  const lastWheel = useRef(0);
  const findInput = useRef(null);
  const pendingFocus = useRef(null);
  const wake = useCallback(() => setSaver(false), []);

  useEffect(() => {
    const pending = pendingFocus.current;
    pendingFocus.current = null;
    setFocusPath(pending?.path ?? null);
    setStaging(Boolean(pending?.stage));
    setArming(null);
  }, [current?.path]);

  /* ── what the list and deck show: the folder, or find results ── */
  const query = find.query.trim().toLowerCase();
  const view = useMemo(() => {
    if (!find.open || !query) return entries;
    if (find.deep) return fsys.search?.results ?? [];
    return entries.filter((e) => e.name.toLowerCase().includes(query));
  }, [entries, find.open, find.deep, query, fsys.search]);
  const searching = find.open && Boolean(query);

  const focusIndex = useMemo(() => {
    const index = focusPath ? view.findIndex((f) => f.path === focusPath) : 0;
    return Math.max(0, index);
  }, [view, focusPath]);
  const focused = view[focusIndex];
  const transferRunning = transfer && (transfer.phase === 'scanning' || transfer.phase === 'copying');

  const step = useCallback(
    (delta) => {
      if (!view.length) return;
      const next = Math.min(view.length - 1, Math.max(0, focusIndex + delta));
      setFocusPath(view[next].path);
    },
    [view, focusIndex]
  );

  const closeFind = useCallback(() => {
    setFind((f) => ({ ...f, open: false, query: '' }));
    fsys.stopSearch();
  }, [fsys]);

  /** Folders are entered; files open on the stage without leaving the folder. */
  const activate = useCallback(
    (entry) => {
      if (!entry) return;
      if (isDir(entry)) {
        if (find.open) closeFind();
        openDirectory(entry.path);
        return;
      }
      const inView = view.some((e) => samePath(e.path, entry.path));
      if (inView) {
        setFocusPath(entry.path);
        setStaging(true);
      } else {
        // a pinned / desktop file: go to its folder and put it on the stage
        if (find.open) closeFind();
        pendingFocus.current = { path: entry.path, stage: true };
        const parent = parentOf(entry.path);
        if (samePath(parent, current?.path)) {
          pendingFocus.current = null;
          setFocusPath(entry.path);
          setStaging(true);
        } else openDirectory(parent);
      }
    },
    [openDirectory, view, find.open, closeFind, current?.path]
  );

  /* ── find ── */
  const openFind = useCallback(() => {
    setFind((f) => ({ ...f, open: true }));
    setMenu(null);
    requestAnimationFrame(() => {
      findInput.current?.focus();
      findInput.current?.select();
    });
  }, []);

  useEffect(() => {
    if (!find.open || !find.deep) return undefined;
    const id = setTimeout(() => fsys.runSearch(find.query), 320);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find.open, find.deep, find.query]);

  useEffect(() => {
    if (searching) setFocusPath(null);
  }, [searching, find.deep, query]);

  const onFindKey = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      activate(focused);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      setFind((f) => ({ ...f, deep: !f.deep }));
      if (find.deep) fsys.stopSearch();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeFind();
      event.currentTarget.blur();
    }
  };

  /* ── actions shared by keys and the right-click menu ── */
  const armTransfer = useCallback(
    (entry = focused) => {
      if (!entry || transferRunning) return;
      setArming(entry.path);
    },
    [focused, transferRunning]
  );

  const askRename = useCallback(
    (entry) => {
      if (!entry) return;
      setDialog({
        title: `RENAME · ${toCode(entry.name)}`,
        initial: entry.name,
        confirmLabel: 'RENAME',
        onConfirm: async (name) => {
          const result = await fsys.rename(entry.path, name);
          if (result.ok) {
            setDialog(null);
            setFocusPath(result.path);
          }
          return result;
        },
      });
    },
    [fsys]
  );

  const askTrash = useCallback(
    (entry) => {
      if (!entry) return;
      setDialog({
        title: 'MOVE TO RECYCLE BIN',
        message: `${entry.name}${entry.type === 'dir' ? ' and everything inside it' : ''} will be moved to the Recycle Bin. You can restore it from there.`,
        confirmLabel: 'RECYCLE',
        danger: true,
        onConfirm: async () => {
          const result = await fsys.trash(entry.path);
          if (result.ok) setDialog(null);
          return result;
        },
      });
    },
    [fsys]
  );

  const previewEntry = useCallback(
    (entry) => {
      if (view.some((e) => samePath(e.path, entry.path))) {
        setFocusPath(entry.path);
        setStaging(true);
      } else activate(entry);
    },
    [view, activate]
  );

  const openMenu = useCallback(
    (target, x, y) => {
      if (!target) return;
      const connected = (fsys.volumes || []).filter((v) => v.connected);
      const copyItems = [
        { label: 'Copy path', onSelect: () => fsys.copyText(target.path) },
        { label: 'Copy name', onSelect: () => fsys.copyText(target.name || target.path) },
      ];

      if (target.type === 'volume') {
        const v = target.volume;
        setMenu({
          x,
          y,
          title: `${v.id} · ${target.name}`,
          items: [
            { label: 'Open', disabled: !v.connected, onSelect: () => openDirectory(v.path) },
            { label: 'Open in Explorer', disabled: !v.connected, onSelect: () => fsys.openInExplorer(v.path) },
            {
              label: focused ? `Transfer ${toCode(focused.name).slice(0, 18)} here` : 'Transfer selection here',
              disabled: !v.connected || !focused || transferRunning,
              onSelect: () => fsys.startTransfer([focused.path], v.id),
            },
            'sep',
            { label: 'Copy path', onSelect: () => fsys.copyText(v.path) },
            { label: 'Refresh volumes', onSelect: fsys.refresh },
          ],
        });
        return;
      }

      if (target.type === 'here') {
        setMenu({
          x,
          y,
          title: toCode(current?.name),
          items: [
            { label: 'Find…', hint: 'Ctrl+F', onSelect: openFind },
            { label: 'Terminal here', hint: 'Ctrl+J', onSelect: term.openTerm },
            { label: 'Refresh', hint: 'F5', onSelect: fsys.refresh },
            { label: 'Open in Explorer', onSelect: () => fsys.openInExplorer(current.path) },
            fsys.isPinned(current.path)
              ? { label: 'Unpin this folder', onSelect: () => fsys.unpin(current.path) }
              : { label: 'Pin this folder', onSelect: () => fsys.pin(current.path) },
            'sep',
            { label: 'Copy path', onSelect: () => fsys.copyText(current.path) },
          ],
        });
        return;
      }

      const dir = target.type === 'dir';
      const missing = target.exists === false;
      const pinned = fsys.isPinned(target.path);
      setMenu({
        x,
        y,
        title: toCode(target.name),
        items: [
          dir
            ? { label: 'Open', hint: 'Enter', disabled: missing, onSelect: () => activate(target) }
            : { label: 'Preview', hint: 'Space', disabled: missing, onSelect: () => previewEntry(target) },
          dir
            ? { label: 'Preview contents', hint: 'Space', disabled: missing, onSelect: () => previewEntry(target) }
            : { label: 'Open with default app', disabled: missing, onSelect: () => fsys.openFile(target.path) },
          { label: 'Show in Explorer', disabled: missing, onSelect: () => fsys.showInFolder(target.path) },
          'sep',
          pinned
            ? { label: 'Unpin from rail', onSelect: () => fsys.unpin(target.path) }
            : { label: 'Pin to rail', onSelect: () => fsys.pin(target.path) },
          {
            label: 'Transfer to',
            disabled: missing || transferRunning,
            children: connected.map((v) => ({
              label: v.system ? `Systems (${v.id})` : `${v.label || 'Volume'} (${v.id})`,
              hint: formatBytes(v.free),
              onSelect: () => fsys.startTransfer([target.path], v.id),
            })),
          },
          ...copyItems,
          'sep',
          { label: 'Rename…', hint: 'F2', disabled: missing, onSelect: () => askRename(target) },
          { label: 'Move to Recycle Bin', hint: 'Del', danger: true, disabled: missing, onSelect: () => askTrash(target) },
        ],
      });
    },
    [fsys, focused, transferRunning, current, openDirectory, openFind, term.openTerm, activate, previewEntry, askRename, askTrash]
  );

  /* ── keyboard ── */
  useEffect(() => {
    const onKey = (event) => {
      if (saver || dialog) return;
      if (event.ctrlKey && (event.key === 'f' || event.key === 'F')) {
        event.preventDefault();
        openFind();
        return;
      }
      if (event.ctrlKey && !event.altKey && !event.metaKey && (event.key === 'j' || event.key === 'J')) {
        event.preventDefault();
        term.toggle();
        return;
      }
      const typing = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|VIDEO)$/.test(event.target.tagName);
      if (typing || menu) return;

      if (event.ctrlKey && (event.key === 'l' || event.key === 'L')) {
        event.preventDefault();
        setSaver(true);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
      } else if (event.key === ' ' && focused && fsys.api) {
        event.preventDefault();
        setStaging((s) => !s);
      } else if (event.key === 'Escape') {
        if (arming) setArming(null);
        else if (staging) setStaging(false);
        else if (term.open) term.closeTerm();
        else if (find.open) closeFind();
      } else if (event.key === 'Enter' && focused) {
        event.preventDefault();
        activate(focused);
      } else if (event.key === 'F2' && focused) {
        event.preventDefault();
        askRename(focused);
      } else if (event.key === 'Delete' && focused) {
        event.preventDefault();
        askTrash(focused);
      } else if ((event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) && focused) {
        event.preventDefault();
        openMenu(focused, window.innerWidth * 0.3, window.innerHeight * 0.45);
      } else if ((event.key === 't' || event.key === 'T') && !event.ctrlKey) {
        event.preventDefault();
        armTransfer();
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
  }, [step, focused, current, openDirectory, fsys, activate, arming, armTransfer, saver, dialog, menu, staging, find.open, closeFind, openFind, term.open, term.toggle, term.closeTerm, askRename, askTrash, openMenu]);

  const onWheel = (event) => {
    const now = performance.now();
    if (now - lastWheel.current < 90) return;
    lastWheel.current = now;
    step(event.deltaY > 0 ? 1 : -1);
  };

  const sendTo = (paths, volume) => {
    setArming(null);
    fsys.startTransfer(paths, volume.id);
  };

  const selectEntry = useCallback((entry) => setFocusPath(entry.path), []);
  const total = knownTotal(view);
  const status = fsys.reading ? 'READING_FOLDER…' : measuring ? 'MEASURING_SIZES…' : 'READY';
  const rank = focusIndex + 1;
  const showStage = staging && focused && fsys.api;
  const codeLabel = searching
    ? `FIND_${toCode(find.query.trim()).slice(0, 14)}_${String(view.length).padStart(3, '0')}`
    : current
      ? `${toCode(current.name)}_${String(view.length).padStart(3, '0')}`
      : 'LOADING';

  return (
    <div className={`shell${term.open ? ' is-term' : ''}`}>
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
        <ThemeSwitch theme={theme} />
        <Clock />
      </header>

      <main className="bezel">
        <div className={`glass${showStage ? ' is-previewing' : ''}`}>
          <div className="glass-sheen" aria-hidden="true" />
          {showStage &&
            (isDir(focused) ? (
              <PreviewSpread folder={focused} api={fsys.api} onClose={() => setStaging(false)} onOpenFile={fsys.openFile} />
            ) : (
              <FileStage file={focused} rank={rank} api={fsys.api} onClose={() => setStaging(false)} onOpenFile={fsys.openFile} />
            ))}
          <DirectoryColumn
            roots={fsys.roots}
            volumes={fsys.volumes}
            current={current}
            entries={view}
            searching={searching}
            focusPath={focused?.path}
            onSelect={selectEntry}
            onOpen={openDirectory}
            onActivate={activate}
            onMenu={openMenu}
          />

          <section
            className="col col-stack"
            aria-label="Folder contents, largest first"
            onWheel={onWheel}
            onContextMenu={(event) => {
              if (event.defaultPrevented || !current) return;
              event.preventDefault();
              openMenu({ type: 'here' }, event.clientX, event.clientY);
            }}
          >
            <p className="stack-code" key={codeLabel}>
              {codeLabel}
            </p>
            <div className="stack-glow" aria-hidden="true" />
            {view.length > 0 ? (
              <FolderStack
                folders={view}
                focusIndex={focusIndex}
                shifted={Boolean(showStage)}
                dark={theme.resolved === 'dark'}
                onFocus={(i) => setFocusPath(view[i].path)}
                onPreview={() => fsys.api && setStaging(true)}
                onOpen={activate}
                onMenu={openMenu}
              />
            ) : (
              <p className="stack-empty">
                {searching ? (find.deep && fsys.search?.running ? 'SCANNING…' : 'NO_MATCHES') : current ? 'EMPTY_FOLDER' : 'READING…'}
              </p>
            )}
            {focused && (
              <p className="callout" key={focused.path}>
                {String(rank).padStart(3, '0')}_{toCode(focused.name)}
              </p>
            )}
            <div className="stack-foot">
              <span>{searching ? `FOUND IN ${find.deep ? 'SUBFOLDERS' : 'THIS FOLDER'}` : 'LARGEST → SMALLEST'}</span>
              {focused && (
                <span>
                  {String(rank).padStart(2, '0')} / {String(view.length).padStart(2, '0')} ·{' '}
                  {focused.error || focused.locked ? 'LOCKED' : formatBytes(focused.bytes)}
                </span>
              )}
              <span>
                TOTAL {formatBytes(total)}
                {measuring ? '…' : ''}
              </span>
            </div>
          </section>

          <RightRail
            mode={fsys.railMode}
            onMode={fsys.setRailMode}
            volumes={fsys.volumes}
            desktopEntries={fsys.desktopEntries}
            pins={fsys.pins}
            currentPath={current?.path}
            arming={Boolean(arming)}
            transfer={transfer}
            onOpen={openDirectory}
            onActivate={activate}
            onPickTarget={(volume) => sendTo([arming], volume)}
            onDropPaths={sendTo}
            onMenu={openMenu}
          />
        </div>
      </main>

      {term.open && <TermLog logRef={term.logRef} runs={term.runs} />}

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
        {find.open ? (
          <FindBar
            find={find}
            count={view.length}
            search={fsys.search}
            inputRef={findInput}
            onChange={(q) => setFind((f) => ({ ...f, query: q }))}
            onToggleDeep={() => {
              setFind((f) => ({ ...f, deep: !f.deep }));
              if (find.deep) fsys.stopSearch();
              findInput.current?.focus();
            }}
            onKey={onFindKey}
            onClose={closeFind}
          />
        ) : (
          <>
            <span className={`status${status === 'READY' ? '' : ' is-busy'}`}>
              {status}
              <span className="caret" aria-hidden="true" />
            </span>
            {current && (
              <span className="meta">
                {String(current.folderCount).padStart(3, '0')} DIR · {String(current.fileCount).padStart(3, '0')} FILE
              </span>
            )}
            {fsys.banner && (
              <span className="banner" role="alert">
                {fsys.banner}
              </span>
            )}
            {arming && <span className="arming">SELECT A VOLUME ON THE RIGHT · ESC TO CANCEL</span>}
          </>
        )}
        <span className="spacer" />
        {term.open && (
          <TermPrompt
            cwd={current?.path}
            draft={term.draft}
            running={term.running}
            inputRef={term.inputRef}
            onDraft={term.setDraft}
            onKey={term.onKey}
            onCancel={term.cancel}
            onClose={term.closeTerm}
          />
        )}
        {transfer ? (
          <TransferStatus transfer={transfer} onCancel={fsys.cancelTransfer} onDismiss={fsys.dismissTransfer} />
        ) : (
          !term.open && (
            <span className="hint">CTRL+F FIND · CTRL+J TERM · SPACE PREVIEW · ENTER OPEN · RIGHT-CLICK ACTIONS</span>
          )
        )}
        <button
          type="button"
          className={`bar-btn${term.open ? ' is-on' : ''}`}
          title="Terminal (Ctrl+J)"
          onClick={term.toggle}
        >
          TERM
        </button>
        <button type="button" className="bar-btn" title="Find (Ctrl+F)" onClick={openFind}>
          FIND
        </button>
        <button
          type="button"
          className="bar-btn"
          disabled={!focused || transferRunning}
          title="Copy the selected item to a volume (T) — or drag a row onto a volume"
          onClick={() => armTransfer()}
        >
          TRANSFER
        </button>
        <button type="button" className="bar-btn" title="Screensaver (Ctrl+L)" onClick={() => setSaver(true)}>
          SCREEN
        </button>
        <button type="button" className="bar-btn" title="Refresh (F5)" onClick={fsys.refresh}>
          REFRESH
        </button>
      </footer>

      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      {dialog && <Dialog {...dialog} onCancel={() => setDialog(null)} />}
      {saver && <Screensaver onWake={wake} />}
    </div>
  );
}

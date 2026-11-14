'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBridge } from './useFileSystem';

function appendChunk(run, stream, text) {
  const chunks = run.chunks.slice();
  const last = chunks[chunks.length - 1];
  if (last && last.stream === stream) chunks[chunks.length - 1] = { stream, text: last.text + text };
  else chunks.push({ stream, text });
  return { ...run, chunks };
}

export function useTerminal({ openDirectory, refresh }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [runs, setRuns] = useState([]);
  const [runningId, setRunningId] = useState(null);
  const inputRef = useRef(null);
  const logRef = useRef(null);
  const runsRef = useRef([]);
  const earlyRef = useRef([]);
  const history = useRef([]);
  const histAt = useRef(-1);
  const saved = useRef('');
  const actions = useRef({ openDirectory, refresh });
  actions.current = { openDirectory, refresh };

  const commit = useCallback((updater) => {
    const next = updater(runsRef.current);
    runsRef.current = next;
    setRuns(next);
  }, []);

  const apply = useCallback(
    (msg) => {
      commit((list) =>
        list.map((run) => {
          if (run.id !== msg.id) return run;
          let next = msg.chunk ? appendChunk(run, msg.stream || 'out', msg.chunk) : run;
          if (msg.done) next = { ...next, done: true, code: msg.code ?? null, stopped: Boolean(msg.stopped) };
          return next;
        })
      );
      if (!msg.done) return;
      setRunningId((id) => (id === msg.id ? null : id));
      if (msg.cd) actions.current.openDirectory?.(msg.cd);
      else actions.current.refresh?.({ measure: false });
    },
    [commit]
  );

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge?.onShell) return undefined;
    return bridge.onShell((msg) => {
      if (!runsRef.current.some((run) => run.id === msg.id)) {
        earlyRef.current.push(msg);
        return;
      }
      apply(msg);
    });
  }, [apply]);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [runs, open]);

  const focus = () => requestAnimationFrame(() => inputRef.current?.focus());

  const openTerm = useCallback(() => {
    setOpen(true);
    focus();
  }, []);

  const closeTerm = useCallback(() => setOpen(false), []);

  const toggle = useCallback(() => {
    setOpen((value) => {
      if (!value) focus();
      return !value;
    });
  }, []);

  const cancel = useCallback(() => {
    getBridge()?.shellCancel?.();
  }, []);

  const run = useCallback(
    async (cwd) => {
      const command = draft.trim();
      if (!command || runningId) return;
      const bridge = getBridge();
      if (!bridge?.shellRun) {
        commit((list) =>
          [...list, { id: Date.now(), command, cwd, chunks: [{ stream: 'err', text: 'Terminal runs inside the Electron app.\n' }], done: true, code: 1 }].slice(-30)
        );
        setDraft('');
        return;
      }
      if (!cwd) return;

      const id = Date.now();
      history.current = [...history.current.filter((item) => item !== command), command].slice(-50);
      histAt.current = -1;
      saved.current = '';
      setDraft('');
      setRunningId(id);
      commit((list) => [...list, { id, command, cwd, chunks: [], done: false, code: null, stopped: false }].slice(-30));

      const queued = earlyRef.current.filter((msg) => msg.id === id);
      earlyRef.current = earlyRef.current.filter((msg) => msg.id !== id);
      queued.forEach(apply);

      const result = await bridge.shellRun({ id, command, cwd });
      if (result?.cd) {
        commit((list) =>
          list.map((run) =>
            run.id === id ? { ...run, chunks: [{ stream: 'out', text: result.cd }], done: true, code: 0 } : run
          )
        );
        setRunningId((current) => (current === id ? null : current));
        actions.current.openDirectory?.(result.cd);
        return;
      }
      if (!result?.ok) {
        commit((list) =>
          list.map((run) =>
            run.id === id
              ? { ...run, chunks: [{ stream: 'err', text: `${result?.message || 'The command failed.'}\n` }], done: true, code: 1 }
              : run
          )
        );
        setRunningId((current) => (current === id ? null : current));
      }
    },
    [apply, commit, draft, runningId]
  );

  const onKey = useCallback(
    (event, cwd) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        run(cwd);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        event.currentTarget.blur();
      } else if (event.key === 'c' && event.ctrlKey && runningId) {
        event.preventDefault();
        cancel();
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const items = history.current;
        if (!items.length) return;
        if (histAt.current === -1) saved.current = draft;
        const next = histAt.current + (event.key === 'ArrowUp' ? 1 : -1);
        if (next < 0) {
          histAt.current = -1;
          setDraft(saved.current);
          return;
        }
        const index = Math.min(next, items.length - 1);
        histAt.current = index;
        setDraft(items[items.length - 1 - index]);
      }
    },
    [cancel, draft, run, runningId]
  );

  return {
    open,
    draft,
    setDraft,
    runs,
    running: runningId !== null,
    inputRef,
    logRef,
    openTerm,
    closeTerm,
    toggle,
    cancel,
    onKey,
  };
}

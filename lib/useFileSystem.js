'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createMockBridge } from './mockBridge';
import { samePath, sortBySize } from './format';

let browserBridge = null;

export function getBridge() {
  if (typeof window === 'undefined') return null;
  if (window.stark) return window.stark;
  if (process.env.NODE_ENV !== 'production') {
    if (!browserBridge) browserBridge = createMockBridge();
    return browserBridge;
  }
  return null;
}

const VOLUME_POLL_MS = 20000;
const FLUSH_MS = 120; // batch size paints; order only settles on shallow + final passes
const PINS_KEY = 'stark.pins';
const RAIL_KEY = 'stark.rail';
const RAIL_MODES = ['volumes', 'desktop', 'pinned'];

const dirEntry = (folder) => ({ type: 'dir', name: folder.name, path: folder.path, bytes: null, error: false });
const fileEntry = (file) => ({
  type: 'file',
  name: file.name,
  path: file.path,
  bytes: file.size ?? null,
  error: false,
  kind: file.kind,
  ext: file.ext,
  modified: file.modified,
  readonly: Boolean(file.readonly),
  locked: Boolean(file.locked),
  where: file.where,
});
const toEntry = (item) => (item.type === 'dir' ? { ...dirEntry(item), where: item.where } : fileEntry(item));

function load(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable; keep in memory only
  }
}

export function useFileSystem() {
  const bridge = useMemo(() => getBridge(), []);
  const [roots, setRoots] = useState({ home: '', desktop: '', common: [] });
  const [volumes, setVolumes] = useState(null);
  const [current, setCurrent] = useState(null);
  const [entries, setEntries] = useState([]);
  const [measuring, setMeasuring] = useState(false);
  const [reading, setReading] = useState(false);
  const [banner, setBanner] = useState(bridge ? '' : 'Open this window with Electron.');
  const [transfer, setTransfer] = useState(null);
  const [railMode, setRailModeState] = useState(() => {
    const saved = load(RAIL_KEY, 'volumes');
    return RAIL_MODES.includes(saved) ? saved : 'volumes';
  });
  const [desktopEntries, setDesktopEntries] = useState(null);
  const [pinPaths, setPinPaths] = useState(() => load(PINS_KEY, null));
  const [pins, setPins] = useState(null);
  const [search, setSearch] = useState(null);

  const tokens = useRef({ inside: 0, rail: 0 });
  const pending = useRef({ inside: new Map(), rail: new Map() });
  const seenSizes = useRef({ inside: new Set(), rail: new Set() });
  const frame = useRef(0);
  const navSeq = useRef(0);
  const currentPath = useRef('');
  const started = useRef(false);
  const searchId = useRef(0);
  const bigList = useRef(false);
  const resortPending = useRef({ inside: false, rail: false });

  const flush = useCallback((kinds) => {
    frame.current = 0;
    const targets = kinds || ['inside', 'rail'];
    for (const kind of targets) {
      const updates = pending.current[kind];
      if (!updates.size) continue;
      const resort = resortPending.current[kind];
      resortPending.current[kind] = false;
      pending.current[kind] = new Map();
      const apply = (list) => {
        if (!list) return list;
        let changed = false;
        const next = list.map((f) => {
          const u = updates.get(f.path);
          if (!u || (u.bytes === f.bytes && u.error === f.error)) return f;
          changed = true;
          return { ...f, bytes: u.bytes, error: u.error };
        });
        if (!changed) return list;
        // Deep refinements only update meters/scale; order settles on shallow + final.
        return resort ? sortBySize(next) : next;
      };
      if (kind === 'inside') setEntries(apply);
      else setDesktopEntries(apply);
    }
  }, []);

  useEffect(() => {
    if (!bridge) return undefined;
    return bridge.onMeasure((msg) => {
      if (!msg || msg.token !== tokens.current[msg.kind]) return;
      if (msg.done) {
        clearTimeout(frame.current);
        resortPending.current[msg.kind] = true;
        flush([msg.kind]);
        // Final order even if the last size ticks already flushed.
        if (msg.kind === 'inside') {
          setEntries((list) => sortBySize(list));
          setMeasuring(false);
        } else {
          setDesktopEntries((list) => (list ? sortBySize(list) : list));
        }
        return;
      }
      const firstSize = !seenSizes.current[msg.kind].has(msg.path);
      seenSizes.current[msg.kind].add(msg.path);
      pending.current[msg.kind].set(msg.path, { bytes: msg.bytes, error: Boolean(msg.error) });
      // Shallow / first sizes re-order once; deep ticks only paint meters.
      if (msg.partial || firstSize) resortPending.current[msg.kind] = true;
      if (!frame.current) {
        const wait = msg.partial ? 40 : bigList.current ? 500 : FLUSH_MS;
        frame.current = setTimeout(() => flush([msg.kind]), wait);
      }
    });
  }, [bridge, flush]);

  useEffect(() => {
    if (!bridge?.onTransfer) return undefined;
    return bridge.onTransfer((msg) => setTransfer(msg));
  }, [bridge]);

  useEffect(() => {
    if (!bridge?.onSearch) return undefined;
    return bridge.onSearch((msg) => {
      if (!msg || msg.id !== searchId.current) return;
      setSearch((s) =>
        s && s.id === msg.id
          ? { ...s, results: [...s.results, ...msg.batch.map(toEntry)], running: !msg.done, scanned: msg.scanned }
          : s
      );
    });
  }, [bridge]);

  const startMeasure = useCallback(
    (kind, list) => {
      const token = ++tokens.current[kind];
      pending.current[kind] = new Map();
      seenSizes.current[kind] = new Set();
      resortPending.current[kind] = false;
      const dirs = list.filter((e) => e.type === 'dir');
      if (kind === 'inside') setMeasuring(dirs.length > 0);
      if (dirs.length) bridge.measure({ token, kind, folders: dirs.map(({ name, path }) => ({ name, path })) });
    },
    [bridge]
  );

  const refreshVolumes = useCallback(async () => {
    if (!bridge?.volumes) {
      setVolumes([]);
      return;
    }
    try {
      setVolumes(await bridge.volumes());
    } catch {
      setVolumes((v) => v || []);
    }
  }, [bridge]);

  /** Lock checks happen after the folder is already on screen. */
  const probeLocks = useCallback(
    async (files, seq) => {
      if (!bridge?.probeLocks || !files.length) return;
      const locked = new Set(await bridge.probeLocks(files.map((f) => f.path)).catch(() => []));
      if (!locked.size || seq !== navSeq.current) return;
      setEntries((list) => list.map((e) => (locked.has(e.path) ? { ...e, locked: true } : e)));
    },
    [bridge]
  );

  const openDirectory = useCallback(
    async (dirPath, { force = false, measure = true } = {}) => {
      if (!bridge || !dirPath) return false;
      if (!force && samePath(dirPath, currentPath.current)) return true;

      const seq = ++navSeq.current;
      setReading(true);
      setBanner('');
      const result = await bridge.listDirectory(dirPath);
      if (seq !== navSeq.current) return false;
      setReading(false);

      if (!result.ok) {
        setBanner(result.message);
        return false;
      }

      currentPath.current = result.path;
      const dirs = result.folders.map(dirEntry);
      const files = (result.files || []).map(fileEntry);
      setCurrent({
        path: result.path,
        name: result.name,
        parent: result.parent,
        ancestry: result.ancestry,
        fileCount: files.length,
        folderCount: dirs.length,
      });
      bigList.current = dirs.length + files.length > 600;
      setEntries(sortBySize([...dirs, ...files]));
      if (measure) startMeasure('inside', dirs);
      probeLocks(files, seq);
      return true;
    },
    [bridge, startMeasure, probeLocks]
  );

  const loadDesktop = useCallback(
    async (desktopPath) => {
      if (!bridge || !desktopPath) {
        setDesktopEntries([]);
        return;
      }
      const result = await bridge.listDirectory(desktopPath);
      if (!result.ok) {
        setDesktopEntries([]);
        return;
      }
      const list = sortBySize([...result.folders.map(dirEntry), ...(result.files || []).map(fileEntry)]);
      setDesktopEntries(list);
      startMeasure('rail', list);
    },
    [bridge, startMeasure]
  );

  const loadPins = useCallback(
    async (paths) => {
      if (!paths?.length) {
        setPins([]);
        return;
      }
      if (!bridge?.statPaths) {
        setPins(paths.map((p) => ({ path: p, name: p.split(/[\\/]/).pop(), type: 'dir', exists: true })));
        return;
      }
      const stats = await bridge.statPaths(paths).catch(() => []);
      setPins(stats.map((s) => ({ ...s, name: s.name || s.path.split(/[\\/]/).pop() })));
    },
    [bridge]
  );

  useEffect(() => {
    if (!bridge || started.current) return;
    started.current = true;

    (async () => {
      try {
        const info = await bridge.bootstrap();
        const common = info.common || [{ name: 'Desktop', path: info.desktop }];
        setRoots({ home: info.home, desktop: info.desktop, common });
        refreshVolumes();
        setPinPaths((p) => p || common.map((c) => c.path));
        const opened = await openDirectory(info.home);
        if (!opened) await openDirectory(info.desktop);
      } catch {
        setReading(false);
        setBanner('Could not read the home folder.');
      }
    })();
  }, [bridge, openDirectory, refreshVolumes]);

  useEffect(() => {
    if (!bridge) return undefined;
    const id = setInterval(refreshVolumes, VOLUME_POLL_MS);
    return () => clearInterval(id);
  }, [bridge, refreshVolumes]);

  useEffect(() => {
    if (railMode === 'desktop' && roots.desktop && desktopEntries === null) loadDesktop(roots.desktop);
  }, [railMode, roots.desktop, desktopEntries, loadDesktop]);

  useEffect(() => {
    if (pinPaths) {
      save(PINS_KEY, pinPaths);
      loadPins(pinPaths);
    }
  }, [pinPaths, loadPins]);

  const setRailMode = useCallback((mode) => {
    setRailModeState(mode);
    save(RAIL_KEY, mode);
  }, []);

  const pin = useCallback((p) => setPinPaths((list) => (list?.some((x) => samePath(x, p)) ? list : [...(list || []), p])), []);
  const unpin = useCallback((p) => setPinPaths((list) => (list || []).filter((x) => !samePath(x, p))), []);
  const isPinned = useCallback((p) => Boolean(pinPaths?.some((x) => samePath(x, p))), [pinPaths]);

  const refresh = useCallback(async ({ measure = true } = {}) => {
    refreshVolumes();
    if (railMode === 'desktop') loadDesktop(roots.desktop);
    if (pinPaths) loadPins(pinPaths);
    if (currentPath.current) await openDirectory(currentPath.current, { force: true, measure });
  }, [openDirectory, refreshVolumes, loadDesktop, loadPins, railMode, roots.desktop, pinPaths]);

  const report = useCallback((result) => {
    if (result && !result.ok && result.message) setBanner(result.message);
    return result;
  }, []);

  /* ── deep search ── */
  const runSearch = useCallback(
    async (query) => {
      if (!bridge?.search || !currentPath.current) return;
      const q = query.trim();
      if (q.length < 2) {
        searchId.current = -1;
        bridge.cancelSearch?.();
        setSearch(null);
        return;
      }
      setSearch({ id: null, query: q, results: [], running: true, scanned: 0 });
      const result = await bridge.search(currentPath.current, q);
      if (!result?.ok) return;
      searchId.current = result.id;
      setSearch((s) => (s && s.query === q ? { ...s, id: result.id } : s));
    },
    [bridge]
  );
  const stopSearch = useCallback(() => {
    searchId.current = -1;
    bridge?.cancelSearch?.();
    setSearch(null);
  }, [bridge]);

  const api = useMemo(() => {
    if (!bridge) return null;
    return {
      previewFolder: (dir) => bridge.previewFolder(dir),
      thumbnail: (file, size) => bridge.thumbnail(file, size),
      readText: (file) => (bridge.readText ? bridge.readText(file) : Promise.resolve({ ok: false, message: 'UNREADABLE' })),
      subtitles: (file) => (bridge.subtitles ? bridge.subtitles(file) : Promise.resolve([])),
      fileUrl: (file) => (bridge.fileUrl ? bridge.fileUrl(file) : null),
    };
  }, [bridge]);

  const openFile = useCallback(async (filePath) => bridge?.openFile && report(await bridge.openFile(filePath)), [bridge, report]);
  const openInExplorer = useCallback(
    async (dirPath) => bridge && dirPath && report(await bridge.openInExplorer(dirPath)),
    [bridge, report]
  );
  const showInFolder = useCallback(async (p) => bridge?.showInFolder && report(await bridge.showInFolder(p)), [bridge, report]);
  const copyText = useCallback(
    async (text) => {
      if (bridge?.copyText) await bridge.copyText(text);
      else await navigator.clipboard?.writeText(text).catch(() => {});
      setBanner('');
    },
    [bridge]
  );
  const rename = useCallback(
    async (p, name) => {
      if (!bridge?.rename) return { ok: false, message: 'Rename is not available here.' };
      const result = await bridge.rename(p, name);
      if (result.ok) {
        setPinPaths((list) => list?.map((x) => (samePath(x, p) ? result.path : x)) ?? list);
        await openDirectory(currentPath.current, { force: true });
      }
      return result;
    },
    [bridge, openDirectory]
  );
  const trash = useCallback(
    async (p) => {
      if (!bridge?.trash) return report({ ok: false, message: 'Delete is not available here.' });
      const result = report(await bridge.trash(p));
      if (result.ok) await openDirectory(currentPath.current, { force: true });
      return result;
    },
    [bridge, openDirectory, report]
  );

  const startTransfer = useCallback(
    async (sources, volumeId) => {
      if (!bridge?.startTransfer) return;
      setBanner('');
      const result = report(await bridge.startTransfer({ sources, volumeId }));
      if (result?.ok) setTransfer({ id: result.id, phase: 'scanning', copied: 0, total: 0, filesDone: 0, fileCount: 0, failed: 0 });
    },
    [bridge, report]
  );
  const cancelTransfer = useCallback(() => bridge?.cancelTransfer?.(), [bridge]);
  const dismissTransfer = useCallback(() => setTransfer(null), []);

  return {
    api,
    roots,
    volumes,
    current,
    entries,
    measuring,
    reading,
    banner,
    transfer,
    railMode,
    setRailMode,
    desktopEntries,
    pins,
    pin,
    unpin,
    isPinned,
    search,
    runSearch,
    stopSearch,
    openDirectory,
    refresh,
    openFile,
    openInExplorer,
    showInFolder,
    copyText,
    rename,
    trash,
    startTransfer,
    cancelTransfer,
    dismissTransfer,
    setBanner,
  };
}

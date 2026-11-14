'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createMockBridge } from './mockBridge';
import { samePath, sortBySize } from './format';

function getBridge() {
  if (typeof window === 'undefined') return null;
  if (window.stark) return window.stark;
  if (process.env.NODE_ENV !== 'production') return createMockBridge();
  return null;
}

const blank = (folder) => ({ name: folder.name, path: folder.path, bytes: null, error: false });

export function useFileSystem() {
  const bridge = useMemo(() => getBridge(), []);
  const [roots, setRoots] = useState({ home: '', desktop: '', drives: [] });
  const [current, setCurrent] = useState(null);
  const [folders, setFolders] = useState([]);
  const [desktopFolders, setDesktopFolders] = useState(null);
  const [measuring, setMeasuring] = useState({ inside: false, desktop: false });
  const [reading, setReading] = useState(false);
  const [banner, setBanner] = useState(bridge ? '' : 'Open this window with Electron.');

  const tokens = useRef({ inside: 0, desktop: 0 });
  const pending = useRef({ inside: new Map(), desktop: new Map() });
  const frame = useRef(0);
  const navSeq = useRef(0);
  const currentPath = useRef('');
  const started = useRef(false);

  const flush = useCallback(() => {
    frame.current = 0;
    for (const kind of ['inside', 'desktop']) {
      const updates = pending.current[kind];
      if (!updates.size) continue;
      pending.current[kind] = new Map();
      const apply = (list) =>
        list ? sortBySize(list.map((f) => (updates.has(f.path) ? { ...f, ...updates.get(f.path) } : f))) : list;
      if (kind === 'inside') setFolders(apply);
      else setDesktopFolders(apply);
    }
  }, []);

  useEffect(() => {
    if (!bridge) return undefined;
    return bridge.onMeasure((msg) => {
      if (!msg || msg.token !== tokens.current[msg.kind]) return;
      if (msg.done) {
        flush();
        setMeasuring((m) => ({ ...m, [msg.kind]: false }));
        return;
      }
      pending.current[msg.kind].set(msg.path, { bytes: msg.bytes, error: Boolean(msg.error) });
      if (!frame.current) frame.current = requestAnimationFrame(flush);
    });
  }, [bridge, flush]);

  const startMeasure = useCallback(
    (kind, list) => {
      const token = ++tokens.current[kind];
      pending.current[kind] = new Map();
      if (!list.length) {
        setMeasuring((m) => ({ ...m, [kind]: false }));
        return;
      }
      setMeasuring((m) => ({ ...m, [kind]: true }));
      bridge.measure({ token, kind, folders: list.map(({ name, path }) => ({ name, path })) });
    },
    [bridge]
  );

  const openDirectory = useCallback(
    async (dirPath, { force = false } = {}) => {
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
      const list = result.folders.map(blank);
      setCurrent({
        path: result.path,
        name: result.name,
        parent: result.parent,
        ancestry: result.ancestry,
        fileCount: result.fileCount,
        directFileBytes: result.directFileBytes,
      });
      setFolders(list);
      startMeasure('inside', list);
      return true;
    },
    [bridge, startMeasure]
  );

  const loadDesktop = useCallback(
    async (desktopPath) => {
      if (!bridge || !desktopPath) {
        setDesktopFolders([]);
        return;
      }
      const result = await bridge.listDirectory(desktopPath);
      if (!result.ok) {
        setDesktopFolders([]);
        setBanner((b) => b || `Desktop: ${result.message}`);
        return;
      }
      const list = result.folders.map(blank);
      setDesktopFolders(list);
      startMeasure('desktop', list);
    },
    [bridge, startMeasure]
  );

  useEffect(() => {
    if (!bridge || started.current) return;
    started.current = true;

    (async () => {
      try {
        const info = await bridge.bootstrap();
        setRoots({ home: info.home, desktop: info.desktop, drives: info.drives || [] });
        loadDesktop(info.desktop);
        const opened = await openDirectory(info.home);
        if (!opened && !(await openDirectory(info.desktop)) && info.drives?.[0]) {
          await openDirectory(info.drives[0]);
        }
      } catch {
        setReading(false);
        setBanner('Could not read drives and the desktop.');
      }
    })();
  }, [bridge, loadDesktop, openDirectory]);

  const refresh = useCallback(async () => {
    await loadDesktop(roots.desktop);
    if (currentPath.current) await openDirectory(currentPath.current, { force: true });
  }, [loadDesktop, openDirectory, roots.desktop]);

  const openInExplorer = useCallback(
    async (dirPath) => {
      if (!bridge || !dirPath) return;
      const result = await bridge.openInExplorer(dirPath);
      if (!result.ok) setBanner(result.message);
    },
    [bridge]
  );

  const previewApi = useMemo(
    () =>
      bridge?.previewFolder
        ? { previewFolder: (dir) => bridge.previewFolder(dir), thumbnail: (file) => bridge.thumbnail(file) }
        : null,
    [bridge]
  );

  const openFile = useCallback(
    async (filePath) => {
      if (!bridge?.openFile || !filePath) return;
      const result = await bridge.openFile(filePath);
      if (!result.ok) setBanner(result.message);
    },
    [bridge]
  );

  return {
    roots,
    previewApi,
    openFile,
    current,
    folders,
    desktopFolders,
    measuring,
    reading,
    banner,
    openDirectory,
    refresh,
    openInExplorer,
  };
}

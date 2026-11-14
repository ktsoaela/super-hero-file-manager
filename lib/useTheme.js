'use client';

import { useEffect, useState } from 'react';

const KEY = 'stark.theme';
const MODES = ['system', 'light', 'dark'];

function readSaved() {
  try {
    const value = window.localStorage.getItem(KEY);
    return MODES.includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

/** mode: what the user picked (system | light | dark). resolved: what is actually shown. */
export function useTheme() {
  const [mode, setMode] = useState(readSaved);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return undefined;
    const onChange = (event) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  const choose = (next) => {
    setMode(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // storage unavailable; the choice lasts for this session only
    }
  };

  return { mode, resolved, choose, modes: MODES };
}

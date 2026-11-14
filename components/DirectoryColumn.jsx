'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FileGlyph, FolderGlyph } from './Glyphs';
import { byIndexOrder, samePath, statusOf, tabColor, toCode } from '../lib/format';

export const DRAG_TYPE = 'application/x-stark-path';

const ROW = 29; // 25px row + 4px gap, matches .dir-row
const VIRTUAL_AT = 60; // above this many rows only the visible window is rendered
const OVERSCAN = 8;

const Row = memo(function Row({ entry, label, title, glyphKind = 'dir', tab, locked, active, current, index = 0, dragPath, where, onClick, onDoubleClick, onMenu }) {
  const Glyph = glyphKind === 'dir' ? FolderGlyph : FileGlyph;
  const className = ['dir-row', active && 'is-active', current && 'is-current'].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={className}
      style={{ '--i': Math.min(index, 24) }}
      title={title}
      draggable={Boolean(dragPath)}
      onDragStart={
        dragPath
          ? (event) => {
              event.dataTransfer.setData(DRAG_TYPE, dragPath);
              event.dataTransfer.effectAllowed = 'copy';
            }
          : undefined
      }
      onClick={() => onClick(entry)}
      onDoubleClick={onDoubleClick ? () => onDoubleClick(entry) : undefined}
      onContextMenu={
        onMenu
          ? (event) => {
              event.preventDefault();
              onMenu(entry, event.clientX, event.clientY);
            }
          : undefined
      }
    >
      <span className="dir-chip">
        <Glyph tab={tab} locked={locked} />
        <span className="dir-code">{label}</span>
        {where != null && <span className="dir-where">{where ? `· ${where}` : '· HERE'}</span>}
      </span>
    </button>
  );
});

export default function DirectoryColumn({ roots, volumes, current, entries, focusPath, searching, onSelect, onOpen, onActivate, onMenu }) {
  const scroller = useRef(null);
  const group = useRef(null);
  const [view, setView] = useState({ top: 0, height: 800 });
  // Alphabetical order only changes when the set of paths changes, not when sizes arrive,
  // so sort once per listing and re-map to the latest entry objects afterwards.
  const signature = `${searching ? 's' : 'f'}|${entries.length}|${entries[0]?.path}|${entries[entries.length - 1]?.path}|${current?.path}`;
  const order = useMemo(
    () => (searching ? entries.map((e) => e.path) : entries.slice().sort(byIndexOrder).map((e) => e.path)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature]
  );
  const ordered = useMemo(() => {
    const byPath = new Map(entries.map((e) => [e.path, e]));
    const out = [];
    for (const p of order) {
      const e = byPath.get(p);
      if (e) out.push(e);
    }
    return out.length === entries.length ? out : entries.slice().sort(byIndexOrder);
  }, [order, entries]);
  const virtual = ordered.length > VIRTUAL_AT;
  const activeIndex = useMemo(() => ordered.findIndex((e) => e.path === focusPath), [ordered, focusPath]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const update = () => setView({ top: el.scrollTop, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, []);

  // keep the teal row in view (works for virtual rows that are not mounted yet)
  useEffect(() => {
    const el = scroller.current;
    if (!el || activeIndex < 0 || !group.current) return;
    const rowTop = group.current.offsetTop + activeIndex * ROW;
    if (rowTop < el.scrollTop + 8) el.scrollTop = rowTop - 8;
    else if (rowTop + ROW > el.scrollTop + el.clientHeight - 8) el.scrollTop = rowTop + ROW - el.clientHeight + 8;
  }, [activeIndex, focusPath]);

  useEffect(() => {
    if (scroller.current && !searching) scroller.current.scrollTop = 0;
  }, [current?.path, searching]);

  const here = current?.path;
  const places = useMemo(
    () =>
      [
        { label: 'HOME', path: roots.home },
        { label: 'DESKTOP', path: roots.desktop },
        ...(volumes || []).filter((v) => v.connected).map((v) => ({ label: `DRIVE_${toCode(v.id)}`, path: v.path })),
      ].filter((p) => p.path),
    [roots.home, roots.desktop, volumes]
  );
  const parentEntry = useMemo(() => (current?.parent ? { path: current.parent } : null), [current?.parent]);

  let start = 0;
  let end = ordered.length;
  if (virtual && group.current) {
    const offset = view.top - group.current.offsetTop;
    start = Math.max(0, Math.floor(offset / ROW) - OVERSCAN);
    end = Math.min(ordered.length, Math.ceil((offset + view.height) / ROW) + OVERSCAN);
  } else if (virtual) {
    end = Math.min(ordered.length, 40);
  }

  // stable handlers so memoised rows only re-render when their own data changes
  const handlers = useRef({});
  handlers.current = { onOpen, onSelect, onActivate, onMenu };
  const openPlace = useCallback((place) => handlers.current.onOpen(place.path), []);
  const select = useCallback((entry) => handlers.current.onSelect(entry), []);
  const activate = useCallback((entry) => handlers.current.onActivate(entry), []);
  const menu = useCallback((entry, x, y) => handlers.current.onMenu?.(entry, x, y), []);

  return (
    <section className="col col-dir" aria-label="File index">
      <div className="dir-scroll" ref={scroller}>
        <div className="dir-group">
          {places.map((place) => (
            <Row
              key={place.label}
              entry={place}
              label={place.label}
              title={place.path}
              current={samePath(place.path, here)}
              onClick={openPlace}
            />
          ))}
          {parentEntry && <Row entry={parentEntry} label="▲ PARENT" title={parentEntry.path} onClick={openPlace} />}
        </div>

        <div
          className={`dir-group${virtual ? ' is-virtual' : ''}`}
          key={searching ? 'search' : here || 'none'}
          ref={group}
          style={virtual ? { height: ordered.length * ROW, position: 'relative' } : undefined}
        >
          {ordered.length === 0 && <p className="col-empty">{searching ? 'NO_MATCHES' : 'EMPTY_FOLDER'}</p>}
          <div style={virtual ? { position: 'absolute', top: start * ROW, left: 0, right: 0 } : undefined}>
            {ordered.slice(start, end).map((entry, i) => {
              const index = start + i;
              const active = index === activeIndex;
              const status = statusOf(entry);
              const tab = status === 'normal' ? undefined : tabColor(entry);
              const locked = status === 'locked';
              return (
                <Row
                  key={entry.path}
                  entry={entry}
                  index={virtual ? 0 : index}
                  label={toCode(entry.name)}
                  glyphKind={entry.type}
                  tab={tab}
                  locked={locked}
                  dragPath={entry.path}
                  where={searching ? entry.where ?? '' : undefined}
                  title={`${entry.path}${locked ? '\nLOCKED' : ''}\nClick to select · double-click to ${entry.type === 'dir' ? 'open' : 'preview'} · right-click for actions`}
                  active={active}
                  onClick={select}
                  onDoubleClick={activate}
                  onMenu={menu}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { TrayGlyph } from './Glyphs';
import { byName, samePath, toCode } from '../lib/format';

function Row({ label, title, active, current, onClick, onDoubleClick, rowRef }) {
  const className = ['dir-row', active && 'is-active', current && 'is-current'].filter(Boolean).join(' ');
  return (
    <button ref={rowRef} type="button" className={className} title={title} onClick={onClick} onDoubleClick={onDoubleClick}>
      <span className="dir-chip">
        <TrayGlyph />
        <span className="dir-code">{label}</span>
      </span>
    </button>
  );
}

export default function DirectoryColumn({ roots, current, folders, focusPath, onSelect, onOpen }) {
  const activeRef = useRef(null);
  const alphabetical = useMemo(() => folders.slice().sort(byName), [folders]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [focusPath]);

  const here = current?.path;
  const places = [
    { label: 'HOME', path: roots.home },
    { label: 'DESKTOP', path: roots.desktop },
    ...roots.drives.map((drive) => ({ label: `DRIVE_${toCode(drive)}`, path: drive })),
  ];

  return (
    <section className="col col-dir" aria-label="File directory">
      <div className="dir-scroll">
        <div className="dir-group">
          {places.map((place) => (
            <Row
              key={place.label}
              label={place.label}
              title={place.path}
              current={samePath(place.path, here)}
              onClick={() => onOpen(place.path)}
            />
          ))}
          {current?.parent && <Row label="▲ PARENT" title={current.parent} onClick={() => onOpen(current.parent)} />}
        </div>

        <div className="dir-group">
          {alphabetical.length === 0 && <p className="col-empty">NO_SUBFOLDERS</p>}
          {alphabetical.map((folder) => {
            const active = samePath(folder.path, focusPath);
            return (
              <Row
                key={folder.path}
                rowRef={active ? activeRef : undefined}
                label={toCode(folder.name)}
                title={`${folder.path}\nClick to select · double-click to open`}
                active={active}
                onClick={() => onSelect(folder.path)}
                onDoubleClick={() => onOpen(folder.path)}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

'use client';

import { useState } from 'react';
import { CubeGlyph, FileGlyph, FolderGlyph } from './Glyphs';
import { DRAG_TYPE } from './DirectoryColumn';
import { formatBytes, maskName, samePath, statusOf, tabColor } from '../lib/format';

const MODES = [
  { id: 'volumes', label: 'VOL', title: 'Drives and volumes' },
  { id: 'desktop', label: 'DESK', title: 'Your desktop' },
  { id: 'pinned', label: 'PINS', title: 'Pinned folders and files (right-click anything → Pin)' },
];

function volumeName(volume) {
  if (volume.system) return 'Systems';
  if (volume.label) return volume.label.replace(/\s+/g, '_');
  return `Volume_${volume.id.replace(':', '')}`;
}

function Volumes({ volumes, currentPath, arming, transfer, onOpen, onDropPaths, onPickTarget, onMenu }) {
  const [over, setOver] = useState(null);
  const busyId = transfer && (transfer.phase === 'scanning' || transfer.phase === 'copying') ? transfer.label : null;

  if (!volumes) return <p className="col-empty light">READING…</p>;
  if (!volumes.length) return <p className="col-empty light">NO_VOLUMES</p>;

  return volumes.map((volume, index) => {
    const ghost = !volume.connected;
    const name = ghost ? maskName(volume.id + volume.remote) : volumeName(volume);
    const used = volume.size ? 1 - volume.free / volume.size : 0;
    const here = currentPath && samePath(currentPath.slice(0, 3), volume.path);
    const receiving = busyId && (busyId === volume.label || busyId === volume.id);
    const detail = ghost ? (volume.type === 'network' ? 'NETWORK' : 'NO_MEDIA') : `${formatBytes(volume.free)} FREE`;
    const className = [
      'desk-item',
      here && 'is-current',
      ghost && 'is-ghost',
      arming && !ghost && 'is-target',
      over === volume.id && 'is-over',
      receiving && 'is-receiving',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        key={volume.id}
        type="button"
        style={{ '--i': index }}
        className={className}
        title={
          ghost
            ? `${volume.id} ${volume.remote || ''}\n${volume.type === 'network' ? 'NETWORK — disconnected, present but not reachable' : 'NO_MEDIA — present but not reachable'}`
            : `${volume.id} ${volume.label || ''}\n${detail} of ${formatBytes(volume.size)}${arming ? '\nClick to transfer here' : '\nDrop files here to transfer'}`
        }
        onClick={() => (arming && !ghost ? onPickTarget(volume) : onOpen(volume.path))}
        onContextMenu={(event) => {
          event.preventDefault();
          onMenu({ type: 'volume', volume, name, path: volume.path }, event.clientX, event.clientY);
        }}
        onDragOver={(event) => {
          if (ghost || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setOver(volume.id);
        }}
        onDragLeave={() => setOver((o) => (o === volume.id ? null : o))}
        onDrop={(event) => {
          setOver(null);
          const dropped = event.dataTransfer.getData(DRAG_TYPE);
          if (!ghost && dropped) {
            event.preventDefault();
            onDropPaths([dropped], volume);
          }
        }}
      >
        <CubeGlyph tone={ghost ? 'ghost' : volume.system ? 'blue' : 'grey'} crossed={ghost} />
        <span className="desk-text">
          <span className="desk-name">{name}</span>
          <span className="desk-size">{receiving ? 'RECEIVING…' : detail}</span>
          {!ghost && volume.size ? (
            <span className="vol-meter" aria-hidden="true">
              <i style={{ width: `${Math.round(used * 100)}%` }} />
            </span>
          ) : null}
        </span>
      </button>
    );
  });
}

function Items({ items, empty, currentPath, onActivate, onMenu, pinned }) {
  if (!items) return <p className="col-empty light">READING…</p>;
  if (!items.length) return <p className="col-empty light">{empty}</p>;

  return items.map((item, index) => {
    const missing = item.exists === false;
    const status = missing ? 'locked' : statusOf(item);
    const isDir = item.type === 'dir';
    const tab = status === 'normal' ? undefined : tabColor(item);
    const detail = missing
      ? item.locked
        ? 'LOCKED'
        : 'MISSING'
      : isDir
        ? item.bytes == null
          ? pinned
            ? 'FOLDER'
            : 'measuring…'
          : formatBytes(item.bytes)
        : formatBytes(item.bytes ?? item.size);
    return (
      <button
        key={item.path}
        type="button"
        style={{ '--i': index }}
        className={`desk-item${samePath(item.path, currentPath) ? ' is-current' : ''}${missing ? ' is-ghost' : ''}`}
        title={`${item.path}\nRight-click for actions`}
        draggable={!missing}
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_TYPE, item.path);
          event.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => !missing && onActivate(item)}
        onContextMenu={(event) => {
          event.preventDefault();
          onMenu({ ...item, railItem: pinned ? 'pin' : 'desktop' }, event.clientX, event.clientY);
        }}
      >
        <span className="rail-glyph">{isDir ? <FolderGlyph tab={tab} locked={status === 'locked'} /> : <FileGlyph tab={tab} locked={status === 'locked'} />}</span>
        <span className="desk-text">
          <span className="desk-name">{item.name}</span>
          <span className="desk-size">{detail}</span>
        </span>
      </button>
    );
  });
}

export default function RightRail({ mode, onMode, volumes, desktopEntries, pins, currentPath, arming, transfer, onOpen, onActivate, onDropPaths, onPickTarget, onMenu }) {
  const shown = arming ? 'volumes' : mode;
  const count = shown === 'volumes' ? volumes?.length : shown === 'desktop' ? desktopEntries?.length : pins?.length;

  return (
    <section className={`col col-desk${arming ? ' is-arming' : ''}`} aria-label="Right column">
      <div className="rail-tabs" role="tablist" aria-label="Right column shows">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={shown === m.id}
            className={shown === m.id ? 'is-on' : undefined}
            title={m.title}
            disabled={Boolean(arming) && m.id !== 'volumes'}
            onClick={() => onMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="desk-title">
        {arming ? 'SELECT_DESTINATION' : MODES.find((m) => m.id === shown).title.split(' (')[0].toUpperCase().replace(/ /g, '_')}
        <span className="desk-count">{count == null ? '--' : String(count).padStart(2, '0')}</span>
      </p>
      <div className="desk-scroll" key={shown}>
        {shown === 'volumes' && (
          <Volumes
            volumes={volumes}
            currentPath={currentPath}
            arming={arming}
            transfer={transfer}
            onOpen={onOpen}
            onDropPaths={onDropPaths}
            onPickTarget={onPickTarget}
            onMenu={onMenu}
          />
        )}
        {shown === 'desktop' && (
          <Items items={desktopEntries} empty="DESKTOP_EMPTY" currentPath={currentPath} onActivate={onActivate} onMenu={onMenu} />
        )}
        {shown === 'pinned' && (
          <Items items={pins} empty="NOTHING_PINNED" currentPath={currentPath} onActivate={onActivate} onMenu={onMenu} pinned />
        )}
      </div>
    </section>
  );
}

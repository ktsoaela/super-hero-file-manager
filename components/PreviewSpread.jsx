'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatBytes, toCode } from '../lib/format';

const thumbCache = new Map();
const THUMB_CACHE_MAX = 120;

function useThumbnail(api, file) {
  const wants = file.kind === 'image' || file.kind === 'video' || file.kind === 'pdf';
  const [src, setSrc] = useState(() => (wants ? thumbCache.get(file.path) : null));

  useEffect(() => {
    if (!wants || !api?.thumbnail) return undefined;
    if (thumbCache.has(file.path)) {
      setSrc(thumbCache.get(file.path));
      return undefined;
    }
    let live = true;
    api
      .thumbnail(file.path)
      .then((url) => {
        if (thumbCache.size >= THUMB_CACHE_MAX) thumbCache.delete(thumbCache.keys().next().value);
        thumbCache.set(file.path, url || null);
        if (live) setSrc(url || null);
      })
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [api, file.path, wants]);

  return src;
}

function stamp(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`;
}

export function Barcode({ seed }) {
  const bars = useMemo(() => {
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return Array.from({ length: 38 }, (_, i) => 1 + ((h >> i % 24) & 3));
  }, [seed]);
  return (
    <span className="barcode" aria-hidden="true">
      {bars.map((w, i) => (
        <i key={i} style={{ width: w }} />
      ))}
    </span>
  );
}

function SheetHead({ file, index, total }) {
  return (
    <header className="sheet-head">
      <span className="sheet-name" title={file.name}>
        {file.name}
      </span>
      <span className="sheet-meta">
        {formatBytes(file.size)} · {stamp(file.modified)} · {String(index + 1).padStart(2, '0')}/
        {String(total).padStart(2, '0')}
      </span>
    </header>
  );
}

function DocBody({ file }) {
  const lines = (file.snippet ?? '').split('\n').slice(0, 60);
  return (
    <div className="doc-body">
      <div className="doc-form">
        <span>NO. {toCode(file.ext)}-{String(file.size % 100000).padStart(5, '0')}</span>
        <Barcode seed={file.name} />
      </div>
      {file.snippet == null ? (
        <p className="doc-unreadable">CONTENTS NOT READABLE AS TEXT</p>
      ) : (
        <pre className="doc-text">
          {lines.map((line, i) => (
            <span key={i} className={/^\s*#/.test(line) ? 'doc-h' : undefined}>
              {line || ' '}
              {'\n'}
            </span>
          ))}
        </pre>
      )}
      <p className="doc-stamp">SAID TO CONTAIN</p>
    </div>
  );
}

function CodeBody({ file, index, total }) {
  const lines = (file.snippet ?? '').split('\n').slice(0, 70);
  return (
    <div className="code-body">
      {file.snippet == null ? (
        <p className="doc-unreadable">BINARY · NO TEXT PREVIEW</p>
      ) : (
        <pre className="code-text">
          {lines.map((line, i) => (
            <span key={i}>
              <em>{String(i + 1).padStart(3, ' ')}</em>
              {line || ' '}
              {'\n'}
            </span>
          ))}
        </pre>
      )}
      <table className="title-block">
        <tbody>
          <tr>
            <td colSpan={2}>SUPER HERO FILE MANAGER · SCHEMATIC</td>
          </tr>
          <tr>
            <td>TYPE {toCode(file.ext)}</td>
            <td>
              SHEET {String(index + 1).padStart(2, '0')} OF {String(total).padStart(2, '0')}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function MediaBody({ file, src }) {
  return (
    <div className={`media-body media-${file.kind}`}>
      {src ? (
        <img src={src} alt="" draggable={false} />
      ) : src === undefined ? (
        <span className="media-wait">ACQUIRING…</span>
      ) : (
        <span className="media-none">{toCode(file.ext)}</span>
      )}
      {file.kind === 'video' && <span className="play" aria-hidden="true" />}
      {file.kind === 'pdf' && <span className="pdf-stamp">PDF</span>}
    </div>
  );
}

function Sheet({ file, index, total, layout, raised, api, onRaise, onOpenFile }) {
  const src = useThumbnail(api, file);
  const variant = file.kind === 'code' ? 'blueprint' : file.kind === 'doc' ? 'paper' : file.kind === 'file' ? 'card' : file.kind;

  let body;
  if (file.kind === 'code') body = <CodeBody file={file} index={index} total={total} />;
  else if (file.kind === 'doc') body = <DocBody file={file} />;
  else if (file.kind === 'file') body = <span className="card-ext">.{toCode(file.ext)}</span>;
  else body = <MediaBody file={file} src={src} />;

  return (
    <button
      type="button"
      className={`sheet sheet-${variant}${raised ? ' is-raised' : ''}`}
      style={{
        '--x': `${layout.x}%`,
        '--y': `${layout.y}%`,
        '--r': `${layout.r}deg`,
        '--i': index,
        zIndex: raised ? 100 : total - index,
      }}
      title={`${file.path}\nClick to bring forward · double-click to open`}
      onClick={() => onRaise(index)}
      onDoubleClick={() => onOpenFile(file.path)}
    >
      <SheetHead file={file} index={index} total={total} />
      {body}
    </button>
  );
}

function spread(count) {
  // Front sheet on the left, the rest fanned out behind it toward the stack.
  const step = count > 1 ? Math.min(26, 50 / (count - 1)) : 0;
  return Array.from({ length: count }, (_, i) => ({
    x: 2 + i * step,
    y: 4 + (i % 3) * 3.5 + (i % 2) * 2,
    r: ((i * 37) % 7) * 0.45 - 1.3,
  }));
}

export default function PreviewSpread({ folder, api, onClose, onOpenFile }) {
  const [state, setState] = useState({ path: null, data: null, error: '' });
  const [raised, setRaised] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!folder || !api?.previewFolder) return undefined;
    const id = ++seq.current;
    setRaised(0);
    const timer = setTimeout(async () => {
      try {
        const result = await api.previewFolder(folder.path);
        if (id !== seq.current) return;
        setState(result.ok ? { path: folder.path, data: result, error: '' } : { path: folder.path, data: null, error: result.message });
      } catch {
        if (id === seq.current) setState({ path: folder.path, data: null, error: 'UNREADABLE' });
      }
    }, 140);
    return () => clearTimeout(timer);
  }, [folder, api]);

  const files = state.data?.files ?? [];
  const layout = useMemo(() => spread(files.length), [files.length]);
  const loading = state.path !== folder?.path;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === ']' || event.key === 'PageDown') {
        event.preventDefault();
        setRaised((r) => Math.min(files.length - 1, r + 1));
      } else if (event.key === '[' || event.key === 'PageUp') {
        event.preventDefault();
        setRaised((r) => Math.max(0, r - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [files.length]);

  const extra = state.data ? state.data.total - files.length : 0;

  return (
    <section className="preview" aria-label={`Preview of ${folder?.name ?? 'folder'}`}>
      <div className="preview-bar">
        <span className="preview-tag">PREVIEW</span>
        <span className="preview-title">{toCode(folder?.name)}</span>
        <span className="preview-count">
          {loading
            ? 'SCANNING…'
            : state.data
              ? `${String(state.data.total).padStart(3, '0')} FILE · ${String(state.data.folderCount).padStart(3, '0')} DIR${extra > 0 ? ` · +${extra} NOT SHOWN` : ''}`
              : state.error}
        </span>
        <button type="button" className="preview-close" title="Close preview (Esc)" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="sheets" key={state.path || 'none'} aria-busy={loading}>
        {!loading && state.data && files.length === 0 && (
          <p className="preview-empty">
            NO_FILES
            <span>{state.data.folderCount ? `${state.data.folderCount} SUBFOLDERS INSIDE` : 'FOLDER IS EMPTY'}</span>
          </p>
        )}
        {!loading && state.error && <p className="preview-empty">{state.error}</p>}
        {files.map((file, index) => (
          <Sheet
            key={file.path}
            file={file}
            index={index}
            total={files.length}
            layout={layout[index]}
            raised={raised === index}
            api={api}
            onRaise={setRaised}
            onOpenFile={onOpenFile}
          />
        ))}
      </div>
    </section>
  );
}

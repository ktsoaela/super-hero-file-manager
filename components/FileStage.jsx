'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Barcode } from './PreviewSpread';
import { formatBytes, statusOf, toCode } from '../lib/format';

function recordId(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const digits = String(h).padStart(10, '0').slice(0, 10);
  return `${digits}${String.fromCharCode(65 + (h % 26))}${String.fromCharCode(65 + ((h >> 8) % 26))}${String(h % 9999).padStart(4, '0')}`;
}

function stamp(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, value: undefined });
  useEffect(() => {
    let live = true;
    setState({ loading: true, value: undefined });
    Promise.resolve()
      .then(fn)
      .then((value) => live && setState({ loading: false, value }))
      .catch(() => live && setState({ loading: false, value: null }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function Fallback({ api, file, note }) {
  const thumb = useAsync(() => api.thumbnail(file.path, 1200), [file.path]);
  return (
    <div className="stage-media">
      {thumb.value ? <img src={thumb.value} alt="" draggable={false} /> : <span className="media-none">{toCode(file.ext)}</span>}
      {note && <p className="stage-note">{note}</p>}
    </div>
  );
}

function ImageView({ api, file }) {
  const url = api.fileUrl(file.path);
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <Fallback api={api} file={file} />;
  return (
    <div className="stage-media stage-photo">
      <img src={url} alt={file.name} draggable={false} onError={() => setFailed(true)} />
    </div>
  );
}

function PdfView({ api, file }) {
  const url = api.fileUrl(file.path);
  if (!url) return <Fallback api={api} file={file} />;
  return <iframe className="stage-pdf" title={file.name} src={`${url}#toolbar=0&navpanes=0&view=FitH`} />;
}

function VideoView({ api, file }) {
  const url = api.fileUrl(file.path);
  const video = useRef(null);
  const [failed, setFailed] = useState(false);
  const [translate, setTranslate] = useState(false);
  const subs = useAsync(() => api.subtitles(file.path), [file.path]);

  const tracks = useMemo(
    () => (subs.value || []).map((t) => ({ ...t, src: URL.createObjectURL(new Blob([t.vtt], { type: 'text/vtt' })) })),
    [subs.value]
  );
  useEffect(() => () => tracks.forEach((t) => URL.revokeObjectURL(t.src)), [tracks]);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const apply = () => {
      for (let i = 0; i < el.textTracks.length; i += 1) el.textTracks[i].mode = translate && i === 0 ? 'showing' : 'hidden';
    };
    apply();
    el.textTracks.addEventListener?.('addtrack', apply);
    return () => el.textTracks.removeEventListener?.('addtrack', apply);
  }, [translate, tracks]);

  if (!url || failed) {
    return <Fallback api={api} file={file} note={url ? 'FORMAT NOT PLAYABLE HERE — OPEN EXTERNALLY' : null} />;
  }

  return (
    <div className="stage-video">
      <video ref={video} src={url} controls preload="metadata" onError={() => setFailed(true)}>
        {tracks.map((t) => (
          <track key={t.src} kind="subtitles" src={t.src} srcLang={t.lang} label={t.label} />
        ))}
      </video>
      <button
        type="button"
        className={`stage-chip${translate ? ' is-on' : ''}`}
        disabled={!tracks.length}
        title={tracks.length ? 'Show the subtitle track (off by default)' : 'No .srt / .vtt subtitle file next to this video'}
        onClick={() => setTranslate((t) => !t)}
      >
        {tracks.length ? `TRANSLATE · ${tracks[0].label}` : 'NO_SUBTITLE_TRACK'}
      </button>
    </div>
  );
}

function TextView({ api, file, blueprint }) {
  const result = useAsync(() => api.readText(file.path), [file.path]);
  const id = useMemo(() => recordId(file.path), [file.path]);

  if (result.loading) return <p className="stage-wait">DECODING…</p>;
  if (!result.value?.ok) return <p className="stage-wait">{result.value?.message || 'UNREADABLE'}</p>;

  const lines = result.value.text.split('\n');
  if (blueprint) {
    return (
      <div className="stage-doc sheet-blueprint">
        <pre className="code-text stage-text">
          {lines.map((line, i) => (
            <span key={i}>
              <em>{String(i + 1).padStart(4, ' ')}</em>
              {line || ' '}
              {'\n'}
            </span>
          ))}
        </pre>
        {result.value.truncated && <p className="stage-note">FIRST 256 KB SHOWN</p>}
      </div>
    );
  }

  return (
    <div className="stage-doc stage-paper">
      <div className="lading-head">
        <span className="lading-id">{id}</span>
        <Barcode seed={file.name} />
      </div>
      <div className="lading-grid">
        <span>DOCUMENT</span>
        <b>{file.name}</b>
        <span>ISSUED</span>
        <b>{stamp(file.modified)}</b>
      </div>
      <pre className="doc-text stage-text">
        {lines.map((line, i) => (
          <span key={i} className={/^\s*#/.test(line) ? 'doc-h' : undefined}>
            {line || ' '}
            {'\n'}
          </span>
        ))}
      </pre>
      <p className="doc-stamp">SAID TO CONTAIN</p>
      {result.value.truncated && <p className="stage-note">FIRST 256 KB SHOWN</p>}
    </div>
  );
}

function LockedView({ file }) {
  return (
    <div className="stage-locked">
      <svg viewBox="0 0 48 56" aria-hidden="true">
        <path d="M12 24v-8a12 12 0 0 1 24 0v8" fill="none" stroke="currentColor" strokeWidth="5" />
        <rect x="6" y="24" width="36" height="28" rx="3" fill="currentColor" />
      </svg>
      <p>LOCKED</p>
      <span>{file.name} is in use by another program or you do not have permission to read it.</span>
    </div>
  );
}

export default function FileStage({ file, rank, api, onClose, onOpenFile }) {
  const locked = statusOf(file) === 'locked';
  let view;
  if (locked) view = <LockedView file={file} />;
  else if (file.kind === 'image') view = <ImageView api={api} file={file} />;
  else if (file.kind === 'pdf') view = <PdfView api={api} file={file} />;
  else if (file.kind === 'video') view = <VideoView api={api} file={file} />;
  else if (file.kind === 'code') view = <TextView api={api} file={file} blueprint />;
  else if (file.kind === 'doc') view = <TextView api={api} file={file} />;
  else view = <Fallback api={api} file={file} note="NO BUILT-IN VIEWER — OPEN EXTERNALLY" />;

  return (
    <section className="preview stage" aria-label={`Preview of ${file.name}`}>
      <div className="stage-body" key={file.path}>
        {view}
      </div>
      <div className="preview-bar">
        <span className="preview-tag">STAGE</span>
        <span className="preview-title">
          {String(rank).padStart(3, '0')}_{toCode(file.name)}
        </span>
        <span className="preview-count">
          {formatBytes(file.bytes)} · {stamp(file.modified)}
        </span>
        <button type="button" className="preview-open" onClick={() => onOpenFile(file.path)} title="Open in its Windows app">
          OPEN_EXT
        </button>
        <button type="button" className="preview-close" title="Close preview (Esc)" onClick={onClose}>
          ✕
        </button>
      </div>
    </section>
  );
}

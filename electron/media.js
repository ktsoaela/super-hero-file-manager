const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { Readable } = require('stream');
const { isAllowed } = require('./access');

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  avif: 'image/avif', ico: 'image/x-icon', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  ogv: 'video/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac',
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', vtt: 'text/vtt; charset=utf-8',
};

const TEXT_LIMIT = 256 * 1024;

function mimeOf(file) {
  return MIME[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream';
}

/** stark-file://f/<encoded absolute path> — streams listed files with HTTP range support (video seeking). */
async function handleFileRequest(request) {
  let file;
  try {
    file = decodeURIComponent(new URL(request.url).pathname.slice(1));
  } catch {
    return new Response('Bad path', { status: 400 });
  }
  if (!isAllowed(file)) return new Response('Not allowed', { status: 403 });

  let stat;
  try {
    stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const headers = {
    'Content-Type': mimeOf(file),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };

  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  if (range && stat.size > 0) {
    let start = range[1] ? Number(range[1]) : 0;
    let end = range[2] ? Number(range[2]) : stat.size - 1;
    if (!range[1] && range[2]) {
      start = Math.max(0, stat.size - Number(range[2]));
      end = stat.size - 1;
    }
    end = Math.min(end, stat.size - 1);
    if (start > end || start >= stat.size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    }
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
      status: 206,
      headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${stat.size}` },
    });
  }

  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    status: 200,
    headers: { ...headers, 'Content-Length': String(stat.size) },
  });
}

async function readText(file) {
  if (!isAllowed(file)) return { ok: false, message: 'NOT_AVAILABLE' };
  let handle;
  try {
    handle = await fsp.open(file, 'r');
    const stat = await handle.stat();
    const length = Math.min(stat.size, TEXT_LIMIT);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    const chunk = buffer.subarray(0, bytesRead);
    if (chunk.includes(0)) return { ok: false, message: 'BINARY_FILE' };
    const text = chunk.toString('utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    return { ok: true, text, truncated: stat.size > TEXT_LIMIT, size: stat.size };
  } catch (error) {
    const locked = error && ['EBUSY', 'EPERM', 'EACCES'].includes(error.code);
    return { ok: false, message: locked ? 'LOCKED' : 'UNREADABLE' };
  } finally {
    await handle?.close().catch(() => {});
  }
}

function srtToVtt(text) {
  return `WEBVTT\n\n${text
    .replace(/\r\n?/g, '\n')
    .replace(/^\d+\n(?=\d{2}:\d{2})/gm, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`;
}

/** Sidecar subtitle tracks next to a video: movie.srt, movie.en.vtt, movie.eng.srt … */
async function subtitlesFor(file) {
  if (!isAllowed(file)) return [];
  const dir = path.dirname(file);
  const stem = path.basename(file, path.extname(file)).toLowerCase();
  let names;
  try {
    names = await fsp.readdir(dir);
  } catch {
    return [];
  }

  const tracks = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    const ext = path.extname(lower);
    if ((ext !== '.srt' && ext !== '.vtt') || !lower.startsWith(stem)) continue;
    const middle = lower.slice(stem.length, -ext.length).replace(/^[._-]/, '');
    if (middle && !/^[a-z]{2,3}([-_][a-z]{2,4})?$/.test(middle)) continue;
    try {
      const raw = await fsp.readFile(path.join(dir, name), 'utf8');
      if (raw.length > 2 * 1024 * 1024) continue;
      const vtt = ext === '.vtt' ? raw : srtToVtt(raw);
      tracks.push({ label: middle ? middle.toUpperCase() : 'SUBTITLES', lang: middle.slice(0, 2) || 'en', vtt });
    } catch {
      // unreadable sidecar; skip
    }
    if (tracks.length >= 6) break;
  }
  return tracks;
}

module.exports = { handleFileRequest, readText, subtitlesFor };

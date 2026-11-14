const fs = require('fs/promises');
const path = require('path');
const { nativeImage } = require('electron');
const { allow, isAllowed } = require('./access');

const MAX_SHEETS = 14;
const SNIPPET_BYTES = 3200;
const INLINE_IMAGE_LIMIT = 12 * 1024 * 1024;

const KINDS = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico', 'tif', 'tiff', 'heic', 'svg'],
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'm4v', 'mpg', 'mpeg', 'flv'],
  pdf: ['pdf'],
  doc: ['md', 'markdown', 'txt', 'rtf', 'log', 'csv', 'tsv', 'ini', 'cfg', 'conf', 'env', 'nfo'],
  code: [
    'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'json', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cc',
    'cs', 'php', 'swift', 'lua', 'sh', 'bash', 'ps1', 'psm1', 'bat', 'cmd', 'sql', 'html', 'htm', 'css', 'scss', 'less',
    'xml', 'yml', 'yaml', 'toml', 'vue', 'svelte', 'dart', 'r', 'scala', 'gradle', 'dockerfile', 'makefile', 'gitignore',
  ],
};

const KIND_OF = new Map();
for (const [kind, exts] of Object.entries(KINDS)) for (const ext of exts) KIND_OF.set(ext, kind);

// Lower = shown first. Visual files make the best "sheets".
const PRIORITY = { image: 0, pdf: 1, video: 2, code: 3, doc: 3, file: 5 };

function classify(name) {
  const lower = name.toLowerCase();
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : lower;
  return { ext, kind: KIND_OF.get(ext) || 'file' };
}

async function readSnippet(file) {
  let handle;
  try {
    handle = await fs.open(file, 'r');
    const buffer = Buffer.alloc(SNIPPET_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SNIPPET_BYTES, 0);
    const chunk = buffer.subarray(0, bytesRead);
    if (chunk.includes(0)) return null;
    return chunk.toString('utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function previewFolder(dirPath) {
  if (typeof dirPath !== 'string' || !path.isAbsolute(dirPath)) return { ok: false, message: 'Choose a folder path.' };
  const resolved = path.resolve(dirPath);

  try {
    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const folderCount = entries.filter((e) => e.isDirectory()).length;
    const files = entries.filter((e) => e.isFile() && !e.name.startsWith('~$'));

    const stats = await Promise.all(
      files.map(async (entry) => {
        const full = path.join(resolved, entry.name);
        try {
          const stat = await fs.stat(full);
          return { name: entry.name, path: full, size: stat.size, modified: stat.mtimeMs, ...classify(entry.name) };
        } catch {
          return null;
        }
      })
    );

    const all = stats.filter(Boolean);
    const counts = {};
    for (const f of all) counts[f.kind] = (counts[f.kind] || 0) + 1;

    const picked = all
      .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || b.modified - a.modified)
      .slice(0, MAX_SHEETS);

    await Promise.all(
      picked.map(async (f) => {
        allow(f.path);
        if (f.kind === 'code' || f.kind === 'doc') f.snippet = await readSnippet(f.path);
      })
    );

    return { ok: true, path: resolved, files: picked, total: all.length, folderCount, counts };
  } catch (error) {
    const denied = error && (error.code === 'EPERM' || error.code === 'EACCES');
    return { ok: false, message: denied ? 'ACCESS_DENIED' : 'UNREADABLE' };
  }
}

async function thumbnail(filePath, size = 560) {
  size = Math.max(64, Math.min(1600, Number(size) || 560));
  if (!isAllowed(filePath)) return null;
  const { kind, ext } = classify(filePath);

  try {
    const image = await nativeImage.createThumbnailFromPath(filePath, { width: size, height: Math.round(size * 1.3) });
    if (!image.isEmpty()) return image.toDataURL();
  } catch {
    // no shell thumbnail handler for this type; fall through
  }

  if (kind === 'image') {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > INLINE_IMAGE_LIMIT) return null;
      const data = await fs.readFile(filePath);
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return `data:${mime};base64,${data.toString('base64')}`;
    } catch {
      return null;
    }
  }
  return null;
}

module.exports = { previewFolder, thumbnail, classify };

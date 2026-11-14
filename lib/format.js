export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} B`;
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

export function samePath(a, b) {
  if (!a || !b) return false;
  const norm = (value) => (value.replace(/[\\/]+$/g, '') || value).toLowerCase();
  return norm(a) === norm(b);
}

export function toCode(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/[:\\/]+$/g, '')
    .replace(/\s+/g, '_');
}

// One shared collator: localeCompare with options builds a new one per call, which is
// thousands of times slower when sorting big folders.
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export function byName(a, b) {
  return collator.compare(a.name, b.name);
}

function sizeRank(folder) {
  if (folder.error) return 2;
  if (folder.bytes == null) return 1;
  return 0;
}

export function sortBySize(list) {
  return list.slice().sort((a, b) => {
    const byState = sizeRank(a) - sizeRank(b);
    if (byState !== 0) return byState;
    if (a.bytes != null && b.bytes != null && a.bytes !== b.bytes) return b.bytes - a.bytes;
    return byName(a, b);
  });
}

export function knownTotal(entries) {
  return entries.reduce((sum, f) => sum + (f.error || f.bytes == null ? 0 : f.bytes), 0);
}

export function maxBytes(folders) {
  return folders.reduce((max, f) => Math.max(max, f.error || f.bytes == null ? 0 : f.bytes), 0);
}

const SENSITIVE = /(confidential|secret|classified|private|password|passwd|credential|vault|wallet|keys?\b|token|\.pem$|\.key$|\.kdbx$|id_rsa|\.env$)/i;

/**
 * Status code used by the coloured tabs: blue = normal, yellow = protected (read-only),
 * red = sensitive name or locked, grey = unknown / unreachable.
 */
export function statusOf(entry) {
  if (!entry) return 'normal';
  if (entry.error || entry.locked) return 'locked';
  if (SENSITIVE.test(entry.name)) return 'sensitive';
  if (entry.readonly) return 'readonly';
  return 'normal';
}

export const STATUS_COLOR = {
  normal: '#1d3fc4',
  file: '#1aa6d8',
  readonly: '#e3b21c',
  sensitive: '#c3212d',
  locked: '#c3212d',
};

export function tabColor(entry) {
  const status = statusOf(entry);
  if (status === 'normal' && entry?.type === 'file') return STATUS_COLOR.file;
  return STATUS_COLOR[status];
}

export const isDir = (entry) => entry?.type === 'dir';

/** Folders first, then files, each alphabetical — the order of the text index. */
export function byIndexOrder(a, b) {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
  return byName(a, b);
}

export function maskName(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const tail = (h % 2 ? `${String.fromCharCode(65 + (h % 26))}${String.fromCharCode(65 + ((h >>> 5) % 26))}^` : '') + String(h % 100).padStart(2, '0');
  return `${'*'.repeat(4 + (h % 2))}^${tail}`;
}

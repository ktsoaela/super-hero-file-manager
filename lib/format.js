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

export function byName(a, b) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
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

export function knownTotal(folders) {
  return folders.reduce((sum, f) => sum + (f.error || f.bytes == null ? 0 : f.bytes), 0);
}

export function maxBytes(folders) {
  return folders.reduce((max, f) => Math.max(max, f.error || f.bytes == null ? 0 : f.bytes), 0);
}

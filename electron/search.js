const fs = require('fs/promises');
const path = require('path');
const { classify } = require('./preview');

const LIMIT = 400;
const PARALLEL = 16;
const FLUSH_MS = 120;
const SKIP = new Set(['$recycle.bin', 'system volume information', 'node_modules', '.git', 'windowsapps', 'winsxs']);

/**
 * Breadth-first name search below `root`. Streams batches through `emit(batch, done, scanned)`
 * and stops as soon as `isActive()` turns false (a newer search or a cancel).
 */
async function searchTree(root, query, isActive, emit) {
  const needle = query.toLowerCase();
  const queue = [root];
  let found = 0;
  let scanned = 0;
  let batch = [];
  let last = Date.now();

  const flush = (done) => {
    if (!isActive()) return;
    emit(batch, done, scanned);
    batch = [];
    last = Date.now();
  };

  const visit = async (dir) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    scanned += 1;
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      const isDir = entry.isDirectory();
      if (isDir && !SKIP.has(entry.name.toLowerCase())) queue.push(full);
      if (found < LIMIT && entry.name.toLowerCase().includes(needle)) {
        found += 1;
        const item = { name: entry.name, path: full, type: isDir ? 'dir' : 'file', where: path.relative(root, dir) };
        if (!isDir) {
          Object.assign(item, classify(entry.name));
          try {
            const s = await fs.stat(full);
            item.size = s.size;
            item.modified = s.mtimeMs;
            item.readonly = (s.mode & 0o200) === 0;
          } catch {
            item.size = null;
            item.locked = true;
          }
        }
        batch.push(item);
      }
    }
    if (Date.now() - last > FLUSH_MS && batch.length) flush(false);
  };

  while (queue.length && found < LIMIT && isActive()) {
    const wave = queue.splice(0, PARALLEL);
    await Promise.all(wave.map(visit));
  }
  flush(true);
}

module.exports = { searchTree };

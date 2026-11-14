const fs = require('fs/promises');
const path = require('path');

const READ_LIMIT = 48;
const STAT_BATCH = 96;
const CACHE_MAX = 4000;

/** path → { bytes, mtimeMs, error } — reused when the folder mtime has not changed */
const cache = new Map();

const keyOf = (dir) => path.normalize(dir).toLowerCase();

function remember(dir, bytes, mtimeMs, error) {
  const key = keyOf(dir);
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { bytes, mtimeMs, error: Boolean(error) });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

async function sumFileSizes(files, isActive) {
  let total = 0;

  for (let index = 0; index < files.length; index += STAT_BATCH) {
    if (!isActive()) return total;

    const slice = files.slice(index, index + STAT_BATCH);
    const sizes = await Promise.all(
      slice.map((file) =>
        fs.lstat(file).then((stat) => (stat.isSymbolicLink() || !stat.isFile() ? 0 : stat.size)).catch(() => 0)
      )
    );

    for (const size of sizes) total += size;
  }

  return total;
}

/**
 * Two-phase measure so the deck can settle quickly:
 * 1. Cache hit (same folder mtime) → emit final immediately
 * 2. Shallow pass → direct files only, emit partial so UI can sort once
 * 3. Deep BFS → emit final when each root finishes
 */
function measureFolders(folders, isActive, onOne) {
  return new Promise((resolve) => {
    const roots = new Map();
    const seen = new Set();
    const queue = [];
    let pending = 0;
    let settled = false;
    let pendingMtimes = 0;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const emit = (root, partial) => {
      const info = roots.get(root);
      if (!isActive() || !info) return;
      onOne({ path: root, bytes: info.bytes, error: info.error, partial: Boolean(partial) });
    };

    const enqueue = (root, dir) => {
      const key = keyOf(dir);
      if (seen.has(key)) return;
      seen.add(key);
      const info = roots.get(root);
      info.dirs += 1;
      queue.push({ root, dir });
    };

    const startDeep = (folder) => {
      enqueue(folder.path, folder.path);
    };

    for (const folder of folders) {
      roots.set(folder.path, {
        bytes: 0,
        dirs: 0,
        error: false,
        finished: false,
        shallowDone: false,
        mtimeMs: 0,
      });
    }

    const pump = () => {
      if (!isActive()) {
        finish();
        return;
      }

      while (pending < READ_LIMIT && queue.length > 0) {
        const job = queue.shift();
        const info = roots.get(job.root);
        pending += 1;

        fs.readdir(job.dir, { withFileTypes: true })
          .then(async (entries) => {
            if (!isActive()) return;

            const files = [];
            const isRoot = keyOf(job.dir) === keyOf(job.root);

            for (const entry of entries) {
              const full = path.join(job.dir, entry.name);
              if (entry.isSymbolicLink()) continue;
              if (entry.isDirectory()) enqueue(job.root, full);
              else if (entry.isFile()) files.push(full);
            }

            const bytes = await sumFileSizes(files, isActive);
            if (isActive()) info.bytes += bytes;

            // First read of each root: emit a fast partial so the stack can sort.
            if (isRoot && !info.shallowDone) {
              info.shallowDone = true;
              emit(job.root, true);
            }
          })
          .catch(() => {
            if (keyOf(job.dir) === keyOf(job.root)) {
              info.error = true;
              if (!info.shallowDone) {
                info.shallowDone = true;
                emit(job.root, true);
              }
            }
          })
          .finally(() => {
            pending -= 1;
            info.dirs -= 1;

            if (info.dirs <= 0 && !info.finished) {
              info.finished = true;
              remember(job.root, info.bytes, info.mtimeMs, info.error);
              if (isActive()) emit(job.root, false);
            }

            if (!isActive()) {
              finish();
              return;
            }

            pump();
            if (pending === 0 && queue.length === 0 && pendingMtimes === 0) finish();
          });
      }
    };

    // Resolve cache / mtime first, then only deep-walk the misses.
    pendingMtimes = folders.length;
    if (!folders.length) {
      finish();
      return;
    }

    for (const folder of folders) {
      fs.stat(folder.path)
        .then((stat) => {
          if (!isActive()) return;
          const info = roots.get(folder.path);
          info.mtimeMs = stat.mtimeMs;
          const hit = cache.get(keyOf(folder.path));
          if (hit && hit.mtimeMs === stat.mtimeMs) {
            info.bytes = hit.bytes;
            info.error = hit.error;
            info.finished = true;
            info.shallowDone = true;
            emit(folder.path, false);
            return;
          }
          startDeep(folder);
        })
        .catch(() => {
          if (!isActive()) return;
          const info = roots.get(folder.path);
          info.error = true;
          info.finished = true;
          info.shallowDone = true;
          emit(folder.path, false);
        })
        .finally(() => {
          pendingMtimes -= 1;
          if (!isActive()) {
            finish();
            return;
          }
          pump();
          if (pending === 0 && queue.length === 0 && pendingMtimes === 0) finish();
        });
    }
  });
}

module.exports = { measureFolders };

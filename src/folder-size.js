const fs = require('fs/promises');
const path = require('path');

const READ_LIMIT = 24;
const STAT_BATCH = 64;

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

function measureFolders(folders, isActive, onOne) {
  return new Promise((resolve) => {
    const roots = new Map();
    const seen = new Set();
    const queue = [];
    let pending = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const enqueue = (root, dir) => {
      const key = path.normalize(dir).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const info = roots.get(root);
      info.dirs += 1;
      queue.push({ root, dir });
    };

    for (const folder of folders) {
      roots.set(folder.path, { bytes: 0, dirs: 0, error: false, finished: false });
    }

    for (const folder of folders) {
      enqueue(folder.path, folder.path);
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
            for (const entry of entries) {
              const full = path.join(job.dir, entry.name);
              if (entry.isSymbolicLink()) continue;
              if (entry.isDirectory()) enqueue(job.root, full);
              else if (entry.isFile()) files.push(full);
            }

            const bytes = await sumFileSizes(files, isActive);
            if (isActive()) info.bytes += bytes;
          })
          .catch(() => {
            if (path.normalize(job.dir).toLowerCase() === path.normalize(job.root).toLowerCase()) {
              info.error = true;
            }
          })
          .finally(() => {
            pending -= 1;
            info.dirs -= 1;

            if (info.dirs <= 0 && !info.finished) {
              info.finished = true;
              if (isActive()) {
                onOne({ path: job.root, bytes: info.bytes, error: info.error });
              }
            }

            if (!isActive()) {
              finish();
              return;
            }

            pump();
            if (pending === 0 && queue.length === 0) finish();
          });
      }
    };

    if (queue.length === 0) {
      for (const folder of folders) {
        const info = roots.get(folder.path);
        if (!info.finished) {
          info.finished = true;
          onOne({ path: folder.path, bytes: 0, error: true });
        }
      }
      finish();
      return;
    }

    pump();
  });
}

module.exports = { measureFolders };

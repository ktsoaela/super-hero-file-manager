const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { pipeline } = require('stream/promises');

const FOLDER = 'STARK_TRANSFER';
const TICK_MS = 120;

let active = null;

const lower = (p) => path.resolve(p).toLowerCase();
const isInside = (child, parent) => {
  const c = lower(child);
  const p = lower(parent).replace(/[\\/]+$/, '');
  return c === p || c.startsWith(p + path.sep);
};

async function uniqueTarget(target) {
  const ext = path.extname(target);
  const base = target.slice(0, target.length - ext.length);
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? target : `${base} (${n})${ext}`;
    try {
      await fsp.access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error('No free name at the destination.');
}

/** Lists every file to copy (with sizes) and every directory to create. */
async function scan(source, target, job) {
  const files = [];
  const dirs = [];
  let bytes = 0;
  const stat = await fsp.stat(source);

  if (stat.isFile()) {
    files.push({ from: source, to: target, size: stat.size });
    return { files, dirs, bytes: stat.size };
  }

  const queue = [[source, target]];
  while (queue.length) {
    if (job.cancelled) break;
    const [from, to] = queue.shift();
    dirs.push(to);
    let entries;
    try {
      entries = await fsp.readdir(from, { withFileTypes: true });
    } catch {
      job.failed += 1;
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const a = path.join(from, entry.name);
      const b = path.join(to, entry.name);
      if (entry.isDirectory()) queue.push([a, b]);
      else if (entry.isFile()) {
        try {
          const s = await fsp.stat(a);
          files.push({ from: a, to: b, size: s.size });
          bytes += s.size;
        } catch {
          job.failed += 1;
        }
      }
    }
  }
  return { files, dirs, bytes };
}

function startTransfer({ sources, volume, label }, send) {
  if (active) return { ok: false, message: 'A transfer is already running.' };

  const destRoot = path.join(volume, FOLDER);
  for (const source of sources) {
    if (isInside(destRoot, source)) return { ok: false, message: 'Cannot copy a folder into itself.' };
  }

  const job = {
    id: Date.now(),
    cancelled: false,
    failed: 0,
    copied: 0,
    total: 0,
    filesDone: 0,
    fileCount: 0,
    phase: 'scanning',
    current: '',
    dest: destRoot,
    label,
    stream: null,
  };
  active = job;

  let last = 0;
  const report = (force) => {
    const now = Date.now();
    if (!force && now - last < TICK_MS) return;
    last = now;
    send({
      id: job.id,
      phase: job.phase,
      copied: job.copied,
      total: job.total,
      filesDone: job.filesDone,
      fileCount: job.fileCount,
      failed: job.failed,
      current: job.current,
      dest: job.dest,
      label: job.label,
    });
  };

  (async () => {
    try {
      await fsp.mkdir(destRoot, { recursive: true });
      const plans = [];
      for (const source of sources) {
        const target = await uniqueTarget(path.join(destRoot, path.basename(source) || source.replace(/[:\\/]/g, '')));
        const plan = await scan(source, target, job);
        plans.push(plan);
        job.total += plan.bytes;
        job.fileCount += plan.files.length;
        report();
      }

      job.phase = 'copying';
      report(true);

      for (const plan of plans) {
        for (const dir of plan.dirs) {
          if (job.cancelled) break;
          await fsp.mkdir(dir, { recursive: true }).catch(() => {
            job.failed += 1;
          });
        }
        for (const file of plan.files) {
          if (job.cancelled) break;
          job.current = path.basename(file.from);
          const before = job.copied;
          try {
            await fsp.mkdir(path.dirname(file.to), { recursive: true });
            const input = fs.createReadStream(file.from);
            job.stream = input;
            input.on('data', (chunk) => {
              job.copied += chunk.length;
              report();
            });
            await pipeline(input, fs.createWriteStream(file.to, { flags: 'wx' }));
            const stat = await fsp.stat(file.from).catch(() => null);
            if (stat) await fsp.utimes(file.to, stat.atime, stat.mtime).catch(() => {});
            job.filesDone += 1;
          } catch {
            job.copied = before + file.size;
            if (!job.cancelled) job.failed += 1;
            await fsp.rm(file.to, { force: true }).catch(() => {});
          } finally {
            job.stream = null;
          }
          report();
        }
      }

      job.phase = job.cancelled ? 'cancelled' : 'done';
    } catch (error) {
      console.error('transfer', error);
      job.phase = 'error';
      job.current = error && error.code === 'ENOSPC' ? 'DESTINATION FULL' : 'TRANSFER FAILED';
    } finally {
      report(true);
      active = null;
    }
  })();

  return { ok: true, id: job.id };
}

function cancelTransfer() {
  if (!active) return false;
  active.cancelled = true;
  active.stream?.destroy(new Error('cancelled'));
  return true;
}

module.exports = { startTransfer, cancelTransfer };

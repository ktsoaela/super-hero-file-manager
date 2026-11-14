const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_OUT = 200_000;

let active = null;

function shellBin() {
  if (process.platform === 'win32') return process.env.ComSpec || 'cmd.exe';
  return process.env.SHELL || '/bin/bash';
}

/** A command that is only `cd`, so the file manager can follow the folder. */
function pureCd(command) {
  const trimmed = command.trim();
  if (/[|&;<>\n\r]/.test(trimmed)) return undefined;
  const cdDot = trimmed.match(/^cd(\.\..*)$/i);
  if (cdDot) return cdDot[1].trim();
  const match = trimmed.match(/^(?:cd|chdir)(?:\s+\/d(?=\s|$))?(?:\s+(\S[\s\S]*))?$/i);
  if (!match || !/^(?:cd|chdir)(?:\s|$)/i.test(trimmed)) return undefined;
  let arg = (match[1] || '').trim();
  if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
    arg = arg.slice(1, -1);
  }
  return arg;
}

function resolveCd(arg, cwd) {
  if (arg === '' || arg === '~') return os.homedir();
  if (arg.startsWith('~/') || arg.startsWith('~\\')) return path.join(os.homedir(), arg.slice(2));
  return path.resolve(cwd, arg);
}

function stopShell() {
  const job = active;
  if (!job) return false;
  active = null;
  job.killed = true;
  const { child } = job;
  if (!child || child.exitCode !== null) return true;
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
  return true;
}

function finish(job, payload, onEvent) {
  if (job.closed) return;
  job.closed = true;
  if (active === job) active = null;
  onEvent(payload);
}

/**
 * Run one command in `cwd`. Output is streamed through `onEvent`.
 * A bare `cd` returns `{ cd }` and does not spawn, so the manager can open that folder.
 */
function runShell({ id, command, cwd, onEvent }) {
  const text = String(command || '').replace(/\r?\n/g, ' ').trim();
  if (!text) return { ok: false, message: 'Type a command.' };
  if (text.length > 4000) return { ok: false, message: 'That command is too long.' };
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return { ok: false, message: 'Open a folder first.' };

  const dir = path.resolve(cwd);
  let stat;
  try {
    stat = fs.statSync(dir);
  } catch {
    return { ok: false, message: 'This folder is not available.' };
  }
  if (!stat.isDirectory()) return { ok: false, message: 'This folder is not available.' };

  stopShell();
  const jobId = Number.isFinite(id) ? id : Date.now();

  const cdArg = pureCd(text);
  if (cdArg !== undefined) {
    const target = resolveCd(cdArg, dir);
    try {
      if (!fs.statSync(target).isDirectory()) return { ok: false, message: 'That path is not a folder.' };
    } catch {
      return { ok: false, message: 'That folder does not exist.' };
    }
    return { ok: true, id: jobId, cd: target, code: 0 };
  }

  const bin = shellBin();
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', `chcp 65001>nul & ${text}`] : ['-c', text];
  let child;
  try {
    child = spawn(bin, args, {
      cwd: dir,
      windowsHide: true,
      env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' },
    });
  } catch (error) {
    return { ok: false, message: error.message || 'The shell could not start.' };
  }

  const job = { id: jobId, child, killed: false, sent: 0, closed: false };
  active = job;

  const push = (stream, chunk) => {
    if (job.closed) return;
    let piece = chunk.toString('utf8');
    const room = MAX_OUT - job.sent;
    if (room <= 0) return;
    if (piece.length > room) {
      piece = `${piece.slice(0, room)}\n… output truncated\n`;
      job.sent = MAX_OUT;
      onEvent({ id: jobId, stream, chunk: piece });
      stopShell();
      return;
    }
    job.sent += piece.length;
    onEvent({ id: jobId, stream, chunk: piece });
  };

  child.stdout?.on('data', (chunk) => push('out', chunk));
  child.stderr?.on('data', (chunk) => push('err', chunk));
  child.on('error', (error) => {
    finish(job, { id: jobId, stream: 'err', chunk: `${error.message}\n`, done: true, code: 1 }, onEvent);
  });
  child.on('close', (code) => {
    finish(job, { id: jobId, done: true, code: job.killed ? null : (code ?? 1), stopped: job.killed }, onEvent);
  });

  return { ok: true, id: jobId };
}

module.exports = { runShell, stopShell, shellBin };

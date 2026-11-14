const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/** Dotfiles always count as hidden (Unix + common project junk). */
function isDotHidden(name) {
  return typeof name === 'string' && name.startsWith('.');
}

/**
 * Names with the Windows Hidden attribute in `dir` (one subprocess).
 * Empty set on non-Windows or when nothing is marked hidden.
 */
async function windowsHiddenNames(dir) {
  if (process.platform !== 'win32' || typeof dir !== 'string') return new Set();
  try {
    const { stdout } = await execFileAsync(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', 'dir', '/a:h', '/b', dir],
      { windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 2500 }
    );
    return new Set(
      String(stdout)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.toLowerCase())
    );
  } catch {
    return new Set();
  }
}

function markHidden(name, attrSet) {
  return isDotHidden(name) || (attrSet && attrSet.has(String(name).toLowerCase()));
}

module.exports = { isDotHidden, windowsHiddenNames, markHidden };

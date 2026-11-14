const fs = require('fs/promises');

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Fast volume list — no PowerShell/CIM (those hang on some Windows setups).
 * Uses Node fs.stat / fs.statfs so the rail can paint immediately.
 */
async function readVolumes() {
  if (process.platform !== 'win32') {
    return [{ id: '/', path: '/', label: 'System', type: 'fixed', size: null, free: null, system: true, connected: true }];
  }

  const systemId = (process.env.SystemDrive || 'C:').toUpperCase();
  const probes = [...LETTERS].map(async (letter) => {
    const id = `${letter}:`;
    const root = `${id}\\`;
    try {
      await fs.stat(root);
    } catch {
      return null;
    }

    let size = null;
    let free = null;
    try {
      if (typeof fs.statfs === 'function') {
        const stats = await fs.statfs(root);
        const block = Number(stats.bsize) || 0;
        size = Number(stats.blocks) * block || null;
        free = Number(stats.bfree) * block || null;
      }
    } catch {
      // size optional — drive still listed
    }

    return {
      id,
      path: root,
      label: id === systemId ? 'Systems' : '',
      type: 'fixed',
      size,
      free,
      system: id === systemId,
      remote: '',
      connected: true,
    };
  });

  const found = (await Promise.all(probes)).filter(Boolean);
  return found.sort((a, b) => Number(b.system) - Number(a.system) || a.id.localeCompare(b.id));
}

module.exports = { readVolumes };

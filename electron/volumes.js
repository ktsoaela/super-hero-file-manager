const { execFile } = require('child_process');

const DRIVE_TYPES = { 2: 'removable', 3: 'fixed', 4: 'network', 5: 'optical', 6: 'ram' };

function runPowerShell(script, timeout = 15000) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout) => {
        if (error && !stdout) reject(error);
        else resolve(stdout || '');
      }
    );
  });
}

const SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  '$disks = @(Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, VolumeName, DriveType, Size, FreeSpace, ProviderName)',
  '$net = @(Get-CimInstance Win32_NetworkConnection | Select-Object LocalName, RemoteName, ConnectionState, Status)',
  "$mapped = @(Get-ChildItem HKCU:\\Network | ForEach-Object { [pscustomobject]@{ LocalName = ($_.PSChildName.ToUpper() + ':'); RemoteName = (Get-ItemProperty $_.PSPath).RemotePath } })",
  '[pscustomobject]@{ disks = $disks; net = $net; mapped = $mapped } | ConvertTo-Json -Depth 4 -Compress',
].join('; ');

const list = (value) => (Array.isArray(value) ? value : value ? [value] : []);

async function readVolumes() {
  if (process.platform !== 'win32') {
    return [{ id: '/', path: '/', label: 'System', type: 'fixed', size: null, free: null, system: true, connected: true }];
  }

  const systemId = (process.env.SystemDrive || 'C:').toUpperCase();
  let parsed;
  try {
    parsed = JSON.parse((await runPowerShell(SCRIPT)).trim() || '{}');
  } catch (error) {
    console.error('volumes', error);
    return [{ id: systemId, path: `${systemId}\\`, label: 'Systems', type: 'fixed', size: null, free: null, system: true, connected: true }];
  }

  const byId = new Map();

  for (const disk of list(parsed.disks)) {
    const id = String(disk.DeviceID || '').toUpperCase();
    if (!/^[A-Z]:$/.test(id)) continue;
    const type = DRIVE_TYPES[disk.DriveType] || 'fixed';
    const hasMedia = disk.Size != null && Number(disk.Size) > 0;
    byId.set(id, {
      id,
      path: `${id}\\`,
      label: disk.VolumeName || '',
      type,
      size: hasMedia ? Number(disk.Size) : null,
      free: hasMedia ? Number(disk.FreeSpace) : null,
      system: id === systemId,
      remote: disk.ProviderName || '',
      connected: hasMedia,
    });
  }

  // Network mappings that Windows remembers but cannot currently reach.
  for (const conn of [...list(parsed.net), ...list(parsed.mapped)]) {
    const id = String(conn.LocalName || '').toUpperCase();
    if (!/^[A-Z]:$/.test(id)) continue;
    const state = `${conn.ConnectionState || ''} ${conn.Status || ''}`.toLowerCase();
    const down = /disconnect|unavailable|error|lost/.test(state);
    const known = byId.get(id);
    if (known) {
      if (down) known.connected = false;
      if (!known.remote) known.remote = conn.RemoteName || '';
    } else {
      byId.set(id, {
        id,
        path: `${id}\\`,
        label: '',
        type: 'network',
        size: null,
        free: null,
        system: false,
        remote: conn.RemoteName || '',
        connected: false,
      });
    }
  }

  return [...byId.values()].sort((a, b) => Number(b.system) - Number(a.system) || a.id.localeCompare(b.id));
}

module.exports = { readVolumes };
